import type { TaskId } from '../ai'
import { buildProjectContext } from '../context'
import { uid, type Project } from '../db'
import type { AudioAnalysis } from '../audio/types'
import {
  FORMAT_LABEL, MOOD_TAGS, SHEET_KINDS, TECHNIQUE_LABEL, fmtDur,
  type ArtDirection, type ConceptAnalysis, type MoodSearch, type MoodTag, type PaletteColor,
  type Scene, type Sheet, type SheetKind, type VideoProject,
  SHOT_SIZES, type Shot, type ShotSize, type VideoTechnique, type ShootPlan, type EditPlan, type ColorPlan,
} from './types'

/* ============ contesto ============ */

export interface TrackInfo {
  title: string
  analysis?: AudioAnalysis
}

/** Dati MISURATI del brano collegato: servono a sincronizzare le scene. */
function trackContext(t: TrackInfo): string {
  const lines = [`BRANO COLLEGATO: "${t.title}"`]
  const a = t.analysis
  if (!a) {
    lines.push('(nessuna analisi audio disponibile: non inventare durata, BPM o struttura)')
    return lines.join('\n')
  }
  lines.push(`Durata misurata: ${fmtDur(a.duration)} (${Math.round(a.duration)} s)`)
  if (a.tempo) lines.push(`BPM stimato: ${Math.round(a.tempo.bpm)} (stima, affidabilità ${Math.round(a.tempo.confidence * 100)}%)`)
  if (a.key) lines.push(`Tonalità stimata: ${a.key.key}`)
  if (a.sections.length) {
    lines.push('Sezioni stimate (stessa lettera = parti che si somigliano; LUFS più alto = più intensa):')
    a.sections.forEach((s) => lines.push(`- ${s.label}: ${fmtDur(s.start)}–${fmtDur(s.end)} · ${s.loudness.toFixed(1)} LUFS`))
  }
  return lines.join('\n')
}

export type StepId = 'concept' | 'directions' | 'moodsearch' | 'sheets' | 'screenplay' | 'storyboard' | 'prompts' | 'shoot' | 'edit' | 'color'

/**
 * Tutto ciò che è già stato deciso per questo video, in ordine di workflow.
 * Ogni passo riceve i passi precedenti: è così che resta la coerenza.
 */
export function buildVideoContext(v: VideoProject, p: Project, track: TrackInfo | undefined, upTo: StepId): string {
  const out: string[] = [buildProjectContext(p), '']
  out.push(`VIDEO: "${v.title}" — ${FORMAT_LABEL[v.format]}`)
  out.push(`TECNICHE DI REALIZZAZIONE: ${v.techniques.map((t) => TECHNIQUE_LABEL[t]).join(' + ') || 'non definite'}`)
  if (v.targetSec) out.push(`DURATA PREVISTA: ${fmtDur(v.targetSec)} (${v.targetSec} s)`)
  if (track) out.push('', trackContext(track))
  out.push('', `IDEA DI PARTENZA (parole dell'autore):\n${v.idea || '(vuota)'}`)

  const order: StepId[] = ['concept', 'directions', 'moodsearch', 'sheets', 'screenplay', 'storyboard', 'prompts', 'shoot', 'edit', 'color']
  const at = order.indexOf(upTo)

  const c = v.concept
  if (c) {
    const answered = c.questions.filter((q) => q.answer.trim())
    if (answered.length) {
      out.push('', "RISPOSTE DELL'AUTORE ALLE DOMANDE PRECEDENTI (vincolanti):")
      answered.forEach((q) => out.push(`- D: ${q.question}\n  R: ${q.answer.trim()}`))
    }
    if (at > 0) {
      out.push('', 'CONCEPT ANALIZZATO:')
      out.push(`Logline: ${c.logline}`, `Tema: ${c.theme}`, `Sottotesto: ${c.subtext}`, `Tono: ${c.tone}`, `Promessa visiva: ${c.visualPromise}`)
      if (c.weaknesses.length) out.push(`Debolezze da tenere sotto controllo: ${c.weaknesses.join(' | ')}`)
      if (c.cliches.length) out.push(`Cliché da evitare: ${c.cliches.join(' | ')}`)
    }
  }

  const d = v.direction
  if (d && at > 1) {
    out.push('', `DIREZIONE ARTISTICA SCELTA: ${d.name} — ${d.logline}`)
    out.push(`Palette: ${d.palette.map((x) => `${x.hex} ${x.name} (${x.role})`).join(', ')}`)
    out.push(`Look: ${d.look}`, `Luce: ${d.light}`, `Texture: ${d.texture}`, `Camera: ${d.camera}`)
    if (d.rules.length) out.push(`Regole visive: ${d.rules.join(' | ')}`)
    if (d.avoid.length) out.push(`Da evitare: ${d.avoid.join(' | ')}`)
  }
  if (at > 2) {
    const notes = v.mood.filter((m) => m.note.trim())
    if (notes.length) {
      out.push('', "MOODBOARD — note dell'autore sulle reference raccolte:")
      notes.forEach((m) => out.push(`- [${m.tag}] ${m.note.trim()}`))
    }
  }
  if (at > 3 && v.sheets.length) {
    out.push('', 'SCHEDE CONDIVISE (usa questi nomi esatti, non cambiarne aspetto o dettagli):')
    v.sheets.forEach((s) => {
      out.push(`- [${s.kind}] ${s.name}${s.role ? ` — ${s.role}` : ''}`)
      if (s.look) out.push(`  Aspetto: ${s.look}`)
      if (s.details) out.push(`  Dettagli: ${s.details}`)
      if (s.colors) out.push(`  Colori: ${s.colors}`)
      if (s.behavior) out.push(`  Comportamento/atmosfera: ${s.behavior}`)
      if (s.continuity) out.push(`  Continuità: ${s.continuity}`)
    })
  }
  if (at > 4 && v.scenes.length) {
    out.push('', `SCENEGGIATURA APPROVATA${v.arc ? ` — arco: ${v.arc}` : ''}:`)
    v.scenes.forEach((s, i) => {
      out.push(`SCENA ${i + 1} · ${s.title || 'senza titolo'} · ${s.setting}${s.time ? ` · ${s.time}` : ''} · ${s.durationSec}s${s.music ? ` · musica: ${s.music}` : ''}`)
      out.push(`  Azione: ${s.action}`)
      if (s.sheets.length) out.push(`  Con: ${s.sheets.join(', ')}`)
      if (s.intent) out.push(`  Intento: ${s.intent}`)
    })
  }
  const shots = v.shots ?? []
  if (at > 5 && shots.length) {
    out.push('', 'INQUADRATURE (codice = scena.inquadratura):')
    shotCodes(v).forEach(({ code, shot: t }) => {
      out.push(`${code} [${t.technique === '3d' ? '3D' : 'reale'}] ${t.size}${t.angle ? `, ${t.angle}` : ''}${t.movement ? `, ${t.movement}` : ''}${t.lens ? `, ${t.lens}` : ''} · ${t.durationSec}s — ${t.description}${t.sheets.length ? ` (con ${t.sheets.join(', ')})` : ''}${t.light ? ` · luce: ${t.light}` : ''}${t.transition ? ` · uscita: ${t.transition}` : ''}`)
    })
  }
  return out.join('\n')
}

/** Codici leggibili "scena.inquadratura" (es. 3.2), nell'ordine delle scene. */
export function shotCodes(v: VideoProject): { code: string; shot: Shot; scene: Scene; sceneIndex: number }[] {
  const out: { code: string; shot: Shot; scene: Scene; sceneIndex: number }[] = []
  v.scenes.forEach((scene, i) => {
    ;(v.shots ?? []).filter((t) => t.sceneId === scene.id).forEach((shot, j) => out.push({ code: `${i + 1}.${j + 1}`, shot, scene, sceneIndex: i }))
  })
  return out
}

/* ============ sistema ============ */

const SYSTEM = `Sei il regista e direttore creativo del Video Lab di GENOS AI STUDIO. Lavori per Genos, musicista (synthpop sperimentale) che realizza i propri video con riprese reali e/o in 3D con codice, con mezzi indipendenti.

Come ragioni:
- CREATIVO: proponi idee originali e contaminazioni, mai casuali. Ogni scelta deve nascere dal concept.
- CRITICO: non assecondare. Segnala debolezze, cliché e incoerenze con parole chiare.
- TECNICO: tutto deve essere realizzabile con le tecniche indicate e con una produzione piccola.
- STRATEGICO: considera cosa rende il video riconoscibile e condivisibile, senza tradire l'identità.
- MEMORIA: rispetta decisioni già prese, non riproporre idee scartate, mantieni la coerenza con i passi precedenti.

Regole fisse:
- Non inventare dati che non hai (durate, BPM, luoghi reali, attrezzatura posseduta). Se manca un'informazione decisiva, fai una domanda mirata.
- Scrivi in italiano, concreto, senza frasi di cortesia.
- Rispondi SOLO con un oggetto JSON valido che rispetta esattamente lo schema richiesto. Nessun testo prima o dopo, nessun blocco di codice.`

/* ============ parsing ============ */

/** Estrae il primo oggetto JSON da una risposta, anche se incollata a mano con testo attorno. */
export function extractJson(text: string): Record<string, unknown> {
  const clean = text.replace(/```(?:json)?/gi, '').trim()
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error("La risposta non contiene dati leggibili. Se l'hai incollata a mano, copia tutta la risposta dalla prima { all'ultima }.")
  }
  try {
    const v = JSON.parse(clean.slice(start, end + 1))
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('non è un oggetto')
    return v as Record<string, unknown>
  } catch {
    throw new Error('La risposta è incompleta o danneggiata (forse troncata). Riprova a generarla.')
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])
const objs = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []
const hex = (v: unknown): string => {
  const s = str(v)
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(s)
  if (!m) return ''
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return `#${h.toLowerCase()}`
}
const oneOf = <T extends string>(v: unknown, opts: readonly T[], fallback: T): T =>
  (opts as readonly string[]).includes(str(v).toLowerCase()) ? (str(v).toLowerCase() as T) : fallback

/* ============ passi ============ */

export interface StepPrompt {
  task: TaskId
  system: string
  user: string
  maxTokens: number
}

export function conceptPrompt(ctx: string): StepPrompt {
  return {
    task: 'critical', system: SYSTEM, maxTokens: 6000,
    user: `${ctx}

COMPITO — PASSO 1: ANALISI DEL CONCEPT
Analizza l'idea di partenza come farebbe un regista prima di accettare un lavoro. Sii onesto: se l'idea è vaga, dillo e chiedi.
Le domande devono essere solo quelle le cui risposte cambierebbero davvero il video (massimo 5, zero se non servono). Non ripetere domande a cui l'autore ha già risposto.

Schema JSON:
{
  "logline": "il video in una frase, concreta e visiva",
  "tema": "di cosa parla davvero",
  "sottotesto": "cosa comunica senza dirlo",
  "tono": "registro emotivo",
  "promessa_visiva": "l'immagine o il meccanismo che lo spettatore ricorderà",
  "punti_di_forza": ["..."],
  "debolezze": ["problema concreto + perché è un problema"],
  "cliche": ["cliché in cui l'idea rischia di cadere + come evitarlo"],
  "domande": ["domanda mirata"]
}`,
  }
}

export function parseConcept(text: string, prev?: ConceptAnalysis): ConceptAnalysis {
  const j = extractJson(text)
  const logline = str(j.logline)
  if (!logline && !str(j.tema)) throw new Error("La risposta non contiene l'analisi del concept. Riprova.")
  // le domande già risposte restano: sono memoria del progetto
  const kept = (prev?.questions ?? []).filter((q) => q.answer.trim())
  const fresh = list(j.domande)
    .filter((q) => !kept.some((k) => k.question === q))
    .map((question) => ({ id: uid(), question, answer: '' }))
  return {
    logline, theme: str(j.tema), subtext: str(j.sottotesto), tone: str(j.tono), visualPromise: str(j.promessa_visiva),
    strengths: list(j.punti_di_forza), weaknesses: list(j.debolezze), cliches: list(j.cliche),
    questions: [...kept, ...fresh], updatedAt: Date.now(),
  }
}

export function directionsPrompt(ctx: string, note: string, exclude: string[]): StepPrompt {
  return {
    task: 'creative', system: SYSTEM, maxTokens: 10000,
    user: `${ctx}
${exclude.length ? `\nDIREZIONI GIÀ PROPOSTE IN QUESTA SESSIONE (non ripeterle, nemmeno simili): ${exclude.join(' | ')}\n` : ''}${note ? `\nINDICAZIONE DELL'AUTORE PER QUESTA GENERAZIONE: ${note}\n` : ''}
COMPITO — PASSO 2: DIREZIONE ARTISTICA
Proponi 3 direzioni artistiche realmente diverse tra loro (non tre varianti della stessa). Ognuna deve derivare dal concept e spiegare perché funziona e dove può fallire. Devono essere realizzabili con le tecniche indicate. Palette di 4–6 colori con codice esadecimale.

Schema JSON:
{
  "direzioni": [
    {
      "nome": "nome breve e memorabile",
      "logline": "l'idea visiva in una frase",
      "palette": [{ "hex": "#rrggbb", "nome": "nome del colore", "ruolo": "dove e come si usa" }],
      "look": "stile dell'immagine: formato, contrasto, grana o resa del render",
      "luce": "tipo, direzione e qualità della luce",
      "texture": "materiali e superfici ricorrenti",
      "camera": "linguaggio di camera: ottiche o focali, movimenti, distanza dal soggetto",
      "regole": ["regola visiva da rispettare in ogni scena"],
      "da_evitare": ["cosa romperebbe questa direzione"],
      "perche": "perché funziona per questo concept",
      "limiti": "rischi e limiti pratici"
    }
  ]
}`,
  }
}

function toDirection(o: Record<string, unknown>): ArtDirection | null {
  const name = str(o.nome)
  if (!name) return null
  const palette: PaletteColor[] = objs(o.palette)
    .map((c) => ({ hex: hex(c.hex), name: str(c.nome), role: str(c.ruolo) }))
    .filter((c) => c.hex)
  return {
    id: uid(), name, logline: str(o.logline), palette,
    look: str(o.look), light: str(o.luce), texture: str(o.texture), camera: str(o.camera),
    rules: list(o.regole), avoid: list(o.da_evitare), why: str(o.perche), limits: str(o.limiti),
  }
}

export function parseDirections(text: string): ArtDirection[] {
  const j = extractJson(text)
  const out = objs(j.direzioni).map(toDirection).filter((d): d is ArtDirection => !!d)
  if (!out.length) throw new Error('La risposta non contiene direzioni artistiche. Riprova.')
  return out
}

export function moodSearchPrompt(ctx: string): StepPrompt {
  return {
    task: 'creative', system: SYSTEM, maxTokens: 6000,
    user: `${ctx}

COMPITO — PASSO 3: MOODBOARD
Non puoi vedere né generare immagini: indica all'autore COSA cercare per costruire la moodboard (8–12 voci). Ogni voce deve essere una ricerca concreta (un tipo di immagine, un film, un fotografo, un luogo, un materiale) e non una descrizione generica. Non inventare titoli o autori: se non sei certo che esistano, descrivi il tipo di immagine.
Categorie ammesse: ${MOOD_TAGS.join(', ')}.

Schema JSON:
{ "ricerche": [{ "categoria": "luce", "cosa": "cosa cercare", "perche": "a cosa serve nel video" }] }`,
  }
}

export function parseMoodSearch(text: string): MoodSearch[] {
  const j = extractJson(text)
  const out = objs(j.ricerche)
    .map((o) => ({ id: uid(), tag: oneOf<MoodTag>(o.categoria, MOOD_TAGS, 'altro'), what: str(o.cosa), why: str(o.perche) }))
    .filter((o) => o.what)
  if (!out.length) throw new Error('La risposta non contiene suggerimenti. Riprova.')
  return out
}

export function sheetsPrompt(ctx: string, existing: string[]): StepPrompt {
  return {
    task: 'creative', system: SYSTEM, maxTokens: 8000,
    user: `${ctx}
${existing.length ? `\nSCHEDE GIÀ ESISTENTI (non duplicarle): ${existing.join(', ')}\n` : ''}
COMPITO — PASSO 4: SCHEDE CONDIVISE
Proponi le schede necessarie a mantenere la coerenza visiva: personaggi, ambienti e oggetti ricorrenti. Solo quelli che servono davvero al concept (di solito 2–6). Ogni scheda deve essere abbastanza precisa da poter essere ricreata identica in ogni scena, e coerente con palette e regole della direzione artistica. Non inventare attori o luoghi reali specifici.
Tipi ammessi: ${SHEET_KINDS.join(', ')}.

Schema JSON:
{
  "schede": [
    {
      "tipo": "personaggio",
      "nome": "nome breve usato in sceneggiatura",
      "ruolo": "funzione nel video",
      "aspetto": "descrizione fisica o visiva precisa",
      "dettagli": "costume e accessori (personaggio) / arredo e materiali (ambiente) / forma e stato (oggetto)",
      "colori": "colori dominanti, presi dalla palette",
      "comportamento": "movimento e attitudine (personaggio) / atmosfera (ambiente)",
      "continuita": "cosa non deve mai cambiare tra una scena e l'altra"
    }
  ]
}`,
  }
}

export function parseSheets(text: string): Sheet[] {
  const j = extractJson(text)
  const out = objs(j.schede)
    .map((o): Sheet => ({
      id: uid(), kind: oneOf<SheetKind>(o.tipo, SHEET_KINDS, 'personaggio'), name: str(o.nome), role: str(o.ruolo),
      look: str(o.aspetto), details: str(o.dettagli), colors: str(o.colori), behavior: str(o.comportamento), continuity: str(o.continuita),
    }))
    .filter((s) => s.name)
  if (!out.length) throw new Error('La risposta non contiene schede. Riprova.')
  return out
}

export function screenplayPrompt(ctx: string, note: string, hasTrack: boolean): StepPrompt {
  return {
    task: 'creative', system: SYSTEM, maxTokens: 14000,
    user: `${ctx}
${note ? `\nINDICAZIONE DELL'AUTORE PER QUESTA STESURA: ${note}\n` : ''}
COMPITO — PASSO 5: SCENEGGIATURA
Scrivi la sceneggiatura divisa in scene. Ogni scena descrive ciò che si VEDE e accade (azione), non inquadrature né movimenti di camera: quelli arrivano nello storyboard.
- La somma delle durate deve corrispondere alla durata ${hasTrack ? 'misurata del brano' : 'prevista'}${hasTrack ? ', e ogni scena deve indicare a quale sezione del brano si appoggia (usa i tempi delle sezioni forniti)' : ' (se non è definita, proponi tu una durata sensata per il formato)'}.
- Usa solo personaggi, ambienti e oggetti delle schede condivise, con i loro nomi esatti. Se serve un elemento nuovo, segnalalo in "schede_mancanti".
- Deve esserci una progressione: qualcosa cambia tra l'inizio e la fine.

Schema JSON:
{
  "arco": "la progressione del video in 2–3 frasi",
  "scene": [
    {
      "titolo": "titolo breve",
      "ambientazione": "INT o EST + luogo",
      "momento": "giorno / notte / alba / indefinito",
      "azione": "cosa si vede e cosa succede, al presente",
      "schede": ["nome esatto della scheda"],
      "musica": "${hasTrack ? 'sezione e tempi del brano, es. A 0:00–0:32' : 'momento musicale o sonoro'}",
      "durata_sec": 20,
      "intento": "cosa deve provare o capire lo spettatore"
    }
  ],
  "schede_mancanti": ["elemento usato che non ha ancora una scheda"]
}`,
  }
}

export interface ScreenplayResult {
  arc: string
  scenes: Scene[]
  missing: string[]
}

export function parseScreenplay(text: string): ScreenplayResult {
  const j = extractJson(text)
  const scenes = objs(j.scene)
    .map((o): Scene => ({
      id: uid(), title: str(o.titolo), setting: str(o.ambientazione), time: str(o.momento), action: str(o.azione),
      sheets: list(o.schede), music: str(o.musica),
      durationSec: Math.max(0, Math.round(Number(o.durata_sec) || 0)), intent: str(o.intento),
    }))
    .filter((s) => s.action || s.title)
  if (!scenes.length) throw new Error('La risposta non contiene scene. Riprova.')
  return { arc: str(j.arco), scenes, missing: list(j.schede_mancanti) }
}


/* ============ V2 · storyboard ============ */

export function storyboardPrompt(ctx: string, v: VideoProject, sceneIds: string[], note: string): StepPrompt {
  const target = v.scenes.map((s, i) => ({ s, n: i + 1 })).filter((x) => sceneIds.includes(x.s.id))
  return {
    task: 'creative', system: SYSTEM, maxTokens: 16000,
    user: `${ctx}
${note ? `\nINDICAZIONE DELL'AUTORE: ${note}\n` : ''}
COMPITO — PASSO 6: STORYBOARD
Dividi in inquadrature ${target.length === v.scenes.length ? 'tutte le scene' : `solo ${target.length === 1 ? 'la scena' : 'le scene'} ${target.map((x) => x.n).join(', ')}`}. Per ogni scena la somma delle durate delle inquadrature deve essere uguale alla durata della scena.
- Linguaggio di camera coerente con la direzione artistica (sezione "Camera" e regole visive).
- Tecnica: "reale" per riprese dal vero, "3d" per inquadrature realizzate in 3D/codice, solo tra le tecniche indicate per il video.
- Inquadrature fattibili con una produzione piccola e indipendente: niente droni, gru o effetti costosi se non indispensabili, e in quel caso segnala l'alternativa economica nella descrizione.
- Usa solo i nomi esatti delle schede condivise.
Piani ammessi: ${SHOT_SIZES.join(', ')}.

Schema JSON:
{
  "inquadrature": [
    {
      "scena": 1,
      "piano": "primo piano",
      "angolazione": "altezza occhi / dal basso / dall'alto / zenitale / olandese…",
      "movimento": "fissa / panoramica / carrello / camera a mano / zoom / orbita (3D)…",
      "ottica": "focale indicativa (es. 35mm) o camera virtuale",
      "luce": "come è illuminato il fotogramma",
      "descrizione": "cosa si vede nel fotogramma: composizione, soggetti, azione",
      "durata_sec": 4,
      "transizione": "stacco netto / dissolvenza / match cut / raccordo sul movimento…",
      "schede": ["nome esatto"],
      "tecnica": "reale",
      "suono": "cosa succede nella musica in quel momento (facoltativo)"
    }
  ]
}`,
  }
}

const sizeOf = (v: unknown): ShotSize => {
  const s = str(v).toLowerCase()
  return (SHOT_SIZES as readonly string[]).find((x) => x === s) as ShotSize
    ?? (SHOT_SIZES as readonly string[]).find((x) => s.includes(x)) as ShotSize
    ?? (/dettagl/.test(s) ? 'dettaglio' : /primissim/.test(s) ? 'primissimo piano' : /primo/.test(s) ? 'primo piano' : /mezz/.test(s) ? 'mezza figura' : /americ/.test(s) ? 'piano americano' : /intera/.test(s) ? 'figura intera' : /lunghissim/.test(s) ? 'campo lunghissimo' : /lungo/.test(s) ? 'campo lungo' : 'totale')
}

/** Restituisce le nuove inquadrature, indicizzate per id di scena. */
export function parseStoryboard(text: string, v: VideoProject, allowed: VideoTechnique[]): Map<string, Shot[]> {
  const j = extractJson(text)
  const out = new Map<string, Shot[]>()
  for (const o of objs(j.inquadrature)) {
    const n = Math.round(Number(o.scena))
    const scene = v.scenes[n - 1]
    if (!scene) continue
    const tech = oneOf<VideoTechnique>(o.tecnica, ['reale', '3d'] as const, allowed[0] ?? 'reale')
    const shot: Shot = {
      id: uid(), sceneId: scene.id, size: sizeOf(o.piano), angle: str(o.angolazione), movement: str(o.movimento), lens: str(o.ottica),
      light: str(o.luce), description: str(o.descrizione), durationSec: Math.max(0, Math.round((Number(o.durata_sec) || 0) * 10) / 10),
      transition: str(o.transizione), sheets: list(o.schede), technique: allowed.includes(tech) ? tech : allowed[0] ?? 'reale',
      sound: str(o.suono), prompt: '', note3d: '',
    }
    if (!shot.description) continue
    out.set(scene.id, [...(out.get(scene.id) ?? []), shot])
  }
  if (!out.size) throw new Error('La risposta non contiene inquadrature valide. Riprova.')
  return out
}

/* ============ V2 · prompt per inquadratura ============ */

export function shotPromptsPrompt(ctx: string, codes: string[]): StepPrompt {
  return {
    task: 'creative', system: SYSTEM, maxTokens: 16000,
    user: `${ctx}

COMPITO — PASSO 8: PROMPT PER INQUADRATURA
Per le inquadrature ${codes.join(', ')} scrivi:
- "prompt": un prompt in INGLESE per un generatore di immagini, per ottenere un fotogramma di riferimento dello storyboard. Deve ripetere ogni volta, con le stesse parole, l'aspetto delle schede presenti (coerenza tra inquadrature), la palette e il look della direzione artistica, il tipo di piano, l'angolazione, la luce e la composizione. Niente nomi di artisti, attori o marchi reali. Massimo 600 caratteri.
- "note_3d": SOLO per le inquadrature con tecnica 3D, indicazioni tecniche in italiano per realizzarle con codice/3D (geometrie, materiali, luci, percorso della camera virtuale, eventuali shader o effetti, cosa animare a tempo di musica). Stringa vuota per le inquadrature reali.

Schema JSON:
{ "prompt": [ { "codice": "1.1", "prompt": "…", "note_3d": "" } ] }`,
  }
}

export function parseShotPrompts(text: string): Map<string, { prompt: string; note3d: string }> {
  const j = extractJson(text)
  const out = new Map<string, { prompt: string; note3d: string }>()
  for (const o of objs(j.prompt)) {
    const code = str(o.codice).replace(/^s/i, '')
    if (code) out.set(code, { prompt: str(o.prompt), note3d: str(o.note_3d) })
  }
  if (!out.size) throw new Error('La risposta non contiene prompt. Riprova.')
  return out
}

/* ============ V3 · piano di riprese ============ */

export function shootPrompt(ctx: string, note: string): StepPrompt {
  return {
    task: 'technical', system: SYSTEM, maxTokens: 12000,
    user: `${ctx}
${note ? `\nVINCOLI DELL'AUTORE (giorni disponibili, luoghi, attrezzatura posseduta…): ${note}\n` : ''}
COMPITO — PASSO 9: PIANO DI RIPRESE
Organizza le inquadrature in blocchi di lavoro (giornate o mezze giornate) per girare in modo efficiente, NON in ordine di racconto: raggruppa per luogo, momento della giornata e luce, poi per configurazione di camera. Le inquadrature 3D vanno in blocchi separati di lavoro al computer.
Ogni inquadratura deve comparire in un solo blocco. Non inventare attrezzatura che l'autore possiede: se non lo sai, elenca il minimo indispensabile e alternative economiche.

Schema JSON:
{
  "blocchi": [
    { "titolo": "Giorno 1 — mattina", "luogo": "…", "momento": "…", "inquadrature": ["1.1", "3.2"], "preparazione": "cosa preparare prima", "attrezzatura": ["…"], "note": "rischi, sicurezza, alternative" }
  ],
  "attrezzatura_generale": ["…"],
  "oggetti_di_scena": ["…"],
  "rischi": ["rischio + come ridurlo"]
}`,
  }
}

export function parseShoot(text: string, v: VideoProject): ShootPlan {
  const j = extractJson(text)
  const byCode = new Map(shotCodes(v).map((x) => [x.code, x.shot.id]))
  const days = objs(j.blocchi).map((o) => ({
    id: uid(), title: str(o.titolo), location: str(o.luogo), time: str(o.momento),
    shotIds: list(o.inquadrature).map((c) => byCode.get(c.replace(/^s/i, ''))).filter((x): x is string => !!x),
    prep: str(o.preparazione), gear: list(o.attrezzatura), notes: str(o.note),
  })).filter((d) => d.title || d.shotIds.length)
  if (!days.length) throw new Error('La risposta non contiene un piano di riprese. Riprova.')
  return { days, gear: list(j.attrezzatura_generale), props: list(j.oggetti_di_scena), risks: list(j.rischi), updatedAt: Date.now() }
}

/* ============ V3 · montaggio ============ */

export function editPrompt(ctx: string, note: string): StepPrompt {
  return {
    task: 'creative', system: SYSTEM, maxTokens: 8000,
    user: `${ctx}
${note ? `\nINDICAZIONE DELL'AUTORE: ${note}\n` : ''}
COMPITO — PASSO 10: PIANO DI MONTAGGIO
Definisci come montare il video sulla musica: ritmo dei tagli per sezione del brano (usa sezioni e BPM misurati se ci sono; un taglio "a tempo" cade su multipli di battiti), momenti chiave da sincronizzare, transizioni e cosa evitare. Concreto e applicabile in qualsiasi programma di montaggio.

Schema JSON:
{
  "approccio": "idea di montaggio in 2–3 frasi",
  "sezioni": [ { "sezione": "A 0:00–0:32", "ritmo": "lento / medio / serrato + perché", "tagli": "ogni quanti battiti o secondi, e su cosa tagliare" } ],
  "momenti_chiave": [ { "tempo": "1:04", "cosa": "cosa deve succedere esattamente lì" } ],
  "transizioni": ["…"],
  "da_evitare": ["…"]
}`,
  }
}

export function parseEdit(text: string): EditPlan {
  const j = extractJson(text)
  const plan: EditPlan = {
    approach: str(j.approccio),
    sections: objs(j.sezioni).map((o) => ({ section: str(o.sezione), rhythm: str(o.ritmo), cuts: str(o.tagli) })).filter((x) => x.section || x.rhythm),
    keyMoments: objs(j.momenti_chiave).map((o) => ({ time: str(o.tempo), what: str(o.cosa) })).filter((x) => x.what),
    transitions: list(j.transizioni), avoid: list(j.da_evitare), updatedAt: Date.now(),
  }
  if (!plan.approach && !plan.sections.length) throw new Error('La risposta non contiene un piano di montaggio. Riprova.')
  return plan
}

/* ============ V3 · color ============ */

export function colorPrompt(ctx: string, software: string): StepPrompt {
  return {
    task: 'technical', system: SYSTEM, maxTokens: 8000,
    user: `${ctx}

SOFTWARE DI COLOR DELL'AUTORE: ${software || 'non indicato (usa DaVinci Resolve, gratuito)'}

COMPITO — PASSO 11: COLOR GRADING
Traduci la palette e il look della direzione artistica in un piano di color grading applicabile. Valori indicativi (da verificare a occhio, su un monitor il più neutro possibile). Se il video ha parti in 3D, indica come impostare il render (spazio colore, tone mapping, esposizione) perché si fonda con le riprese reali.

Schema JSON:
{
  "look_generale": "descrizione del look finale",
  "parametri": [ { "nome": "contrasto / temperatura / saturazione / curve / ombre / alte luci / grana…", "valore": "valore indicativo", "perche": "…" } ],
  "per_scena": [ { "scena": "1", "look": "variazione rispetto al look generale", "note": "…" } ],
  "passaggi": ["passo operativo nel software indicato"],
  "render_3d": "impostazioni per le parti 3D (vuoto se non ce ne sono)"
}`,
  }
}

export function parseColor(text: string, software: string): ColorPlan {
  const j = extractJson(text)
  const plan: ColorPlan = {
    overall: str(j.look_generale), software,
    params: objs(j.parametri).map((o) => ({ name: str(o.nome), value: str(o.valore), why: str(o.perche) })).filter((x) => x.name),
    perScene: objs(j.per_scena).map((o) => ({ scene: str(o.scena), look: str(o.look), note: str(o.note) })).filter((x) => x.look || x.note),
    steps: list(j.passaggi), render3d: str(j.render_3d), updatedAt: Date.now(),
  }
  if (!plan.overall && !plan.params.length) throw new Error('La risposta non contiene un piano colore. Riprova.')
  return plan
}
