import { buildProjectContext } from '../context'
import { db, saveProject, uid, type Project } from '../db'
import { extractJson } from '../video/prompts'
import type { RunnerPrompt } from '../../components/AiRunner'
import { FONTS, FORMATS, type ArtConcept, type ArtFormat, type ArtKit, type ArtLayout, type FontName, type Identity } from './types'

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])
const objs = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [])
const hex = (v: unknown) => { const s = str(v).toLowerCase(); const m = s.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/); if (!m) return ''; const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]; return `#${h}` }
const font = (v: unknown, fb: FontName): FontName => { const s = str(v).toLowerCase(); return (FONTS.find((f) => f.name.toLowerCase() === s) ?? FONTS.find((f) => s.includes(f.name.toLowerCase())))?.name ?? fb }

const SYSTEM = `Sei il direttore artistico dell'Art Direction Lab di GENOS AI STUDIO. Lavori per Genos, musicista di synthpop sperimentale indipendente, che crea da zero la propria identità visiva.

VINCOLI DELL'ARTISTA
- Le immagini dei suoi artwork arrivano da: sue foto, render 3D / codice, oppure solo grafica e tipografia. NON usa generatori di immagini AI: non proporre prompt per generatori.
- Gli servono: copertine (singoli/EP), grafiche social (post/storie), locandine per eventi/live, merch.
- Mezzi indipendenti: tutto deve essere realizzabile da una persona con telefono/fotocamera, un computer e software comuni.

PRINCIPI
- Originalità non è casualità: ogni scelta (colore, font, regola) deve servire un concetto e reggere nel tempo e su formati diversi (da un'icona di 64 px a una locandina A3).
- Critico e onesto: per ogni proposta spiega perché funziona e il suo limite. Evita cliché del genere (neon viola/rosa, retrowave, glitch decorativo) a meno di ribaltarli in modo esplicito.
- Rispetta le decisioni creative del progetto e non riproporre idee scartate.
- Italiano. Rispondi SOLO con JSON valido nello schema richiesto.`

/** Contesto: progetto + brani (misure) + video. */
export async function buildArtContext(project: Project): Promise<string> {
  const out = [`CONTESTO DEL PROGETTO\n${buildProjectContext(project)}`]
  const tracks = (await db.tracks.where('projectId').equals(project.id).toArray()).filter((t) => t.kind !== 'reference')
  if (tracks.length) {
    const lines = ['BRANI DEL PROGETTO:']
    for (const t of tracks) {
      const v = [...(await db.versions.where('trackId').equals(t.id).sortBy('createdAt'))].reverse().find((x) => x.analysis)
      const a = v?.analysis
      lines.push(`- "${t.title}"${a ? ` · BPM ${a.tempo?.bpm ?? 'n.d.'} · tonalità ${a.key?.key ?? 'n.d.'} · pendenza spettrale ${a.tiltDbPerOct.toFixed(1)} dB/ottava (più negativo = più scuro) · LRA ${a.lra.toFixed(1)}` : ''}${t.lyrics?.trim() ? `\n  testo (estratto): ${t.lyrics.trim().slice(0, 400).replace(/\n+/g, ' / ')}` : ''}`)
    }
    out.push(lines.join('\n'))
  }
  const refs = (await db.tracks.where('projectId').equals(project.id).toArray()).filter((t) => t.kind === 'reference')
  if (refs.length) out.push(`REFERENCE MUSICALI: ${refs.map((r) => `${r.artist ? `${r.artist} — ` : ''}${r.title}`).join('; ')}`)
  const videos = await db.videos.where('projectId').equals(project.id).toArray()
  const dirs = videos.filter((v) => v.direction).map((v) => `"${v.title}": ${v.direction!.name} — ${v.direction!.logline}`)
  if (dirs.length) out.push(`DIREZIONI ARTISTICHE DEI VIDEO GIÀ SCELTE: ${dirs.join('; ')}`)
  return out.join('\n\n')
}

function identityText(i: Identity) {
  return `IDENTITÀ "${i.name}": ${i.concept}
Parole chiave: ${i.keywords.join(', ')}
Palette: ${i.palette.map((p) => `${p.name} ${p.hex} (${p.role})`).join(', ')}
Font: titoli ${i.fontDisplay}, testi ${i.fontText}. Regole tipografiche: ${i.typeRules.join('; ')}
Logo/wordmark: ${i.logo}
Immagini (foto/3D): ${i.imagery}
Layout: ${i.layout}
Regole: ${i.rules.join('; ')}
Da evitare: ${i.avoid.join('; ')}`
}

/* ================= A1 · identità ================= */

export function identityPrompt(ctx: string, note: string, exclude: string[]): RunnerPrompt {
  return {
    task: 'creative', system: SYSTEM, maxTokens: 14000, json: true,
    user: `${ctx}
${note ? `\nINDICAZIONE DELL'ARTISTA: ${note}\n` : ''}${exclude.length ? `\nDIREZIONI GIÀ SCARTATE (non riproporle nemmeno in forma simile): ${exclude.join('; ')}\n` : ''}
COMPITO: 3 DIREZIONI DI IDENTITÀ VISIVA E SONORA, davvero diverse tra loro.
Font: scegli SOLO tra questi (nome esatto): ${FONTS.map((f) => `${f.name} (${f.kind})`).join(', ')}.
Palette: da 4 a 6 colori in esadecimale con un ruolo ciascuno (sfondo, testo, accento, secondario…). Verifica che testo e sfondo abbiano un contrasto leggibile.
Identità sonora: suoni firma, regole di mix e di arrangiamento coerenti con l'identità visiva e con i brani (usa le misure se ci sono).

Schema JSON:
{
  "direzioni": [
    {
      "nome": "…",
      "concetto": "l'idea in 2–3 frasi",
      "parole_chiave": ["…"],
      "palette": [ { "hex": "#000000", "nome": "…", "ruolo": "sfondo" } ],
      "font_titoli": "…",
      "font_testi": "…",
      "regole_tipografiche": ["…"],
      "logo": "come costruire il logo/wordmark di Genos (forma, font, varianti, uso minimo)",
      "immagini": "stile di foto e render 3D: luce, soggetti, trattamento",
      "layout": "griglie e composizione",
      "regole": ["…"],
      "da_evitare": ["…"],
      "suono": { "firma": ["…"], "mix": ["…"], "arrangiamento": ["…"], "da_evitare": ["…"] },
      "perche_funziona": "…",
      "limiti": "…"
    }
  ]
}`,
  }
}

export function parseIdentities(text: string): Identity[] {
  const j = extractJson(text)
  const out = objs(j.direzioni).map((o): Identity => {
    const s = (o.suono ?? {}) as Record<string, unknown>
    return {
      name: str(o.nome), concept: str(o.concetto), keywords: list(o.parole_chiave),
      palette: objs(o.palette).map((p) => ({ hex: hex(p.hex), name: str(p.nome), role: str(p.ruolo) })).filter((p) => p.hex),
      fontDisplay: font(o.font_titoli, 'Archivo'), fontText: font(o.font_testi, 'Inter Tight'),
      typeRules: list(o.regole_tipografiche), logo: str(o.logo), imagery: str(o.immagini), layout: str(o.layout),
      rules: list(o.regole), avoid: list(o.da_evitare),
      sonic: { signature: list(s.firma), mixRules: list(s.mix), arrangement: list(s.arrangiamento), avoid: list(s.da_evitare) },
      why: str(o.perche_funziona), limits: str(o.limiti),
    }
  }).filter((i) => i.name && i.palette.length >= 2)
  if (!out.length) throw new Error('La risposta non contiene direzioni valide (servono nome e palette). Riprova.')
  return out
}

const ID_PREFIX = 'Identità visiva del progetto:'
const SONIC_PREFIX = 'Identità sonora del progetto:'

/** L'identità scelta diventa una decisione del progetto: così tutti i moduli la rispettano. */
export async function applyIdentityToProject(project: Project, i: Identity, discarded: string[]) {
  const vis = `${ID_PREFIX} "${i.name}" — ${i.concept} Palette ${i.palette.map((p) => `${p.name} ${p.hex} (${p.role})`).join(', ')}. Font titoli ${i.fontDisplay}, testi ${i.fontText}. Regole: ${i.rules.join('; ')}. Evitare: ${i.avoid.join('; ')}.`
  const son = `${SONIC_PREFIX} suoni firma ${i.sonic.signature.join('; ')}; mix: ${i.sonic.mixRules.join('; ')}; arrangiamento: ${i.sonic.arrangement.join('; ')}; evitare: ${i.sonic.avoid.join('; ')}.`
  const decisions = project.decisions.filter((d) => !d.text.startsWith(ID_PREFIX) && !d.text.startsWith(SONIC_PREFIX))
  decisions.push({ id: uid(), area: 'art', text: vis, createdAt: Date.now() })
  if (i.sonic.signature.length || i.sonic.mixRules.length) decisions.push({ id: uid(), area: 'musica', text: son, createdAt: Date.now() })
  const known = new Set(project.discarded.map((d) => d.text))
  const newDiscarded = discarded.filter((n) => !known.has(`Direzione visiva "${n}"`)).map((n) => ({ id: uid(), text: `Direzione visiva "${n}"`, reason: 'scartata nell\'Art Direction Lab', createdAt: Date.now() }))
  await saveProject({ ...project, decisions, discarded: [...project.discarded, ...newDiscarded] })
}

/* ================= A2 · moodboard ================= */

export function moodPrompt(ctx: string, kit: ArtKit, withImages: boolean): RunnerPrompt {
  const i = kit.identity!
  return {
    task: 'critical', json: false, maxTokens: 6000,
    system: `${SYSTEM.replace('Rispondi SOLO con JSON valido nello schema richiesto.', 'Rispondi in markdown.')}

MODALITÀ: CRITICA della moodboard rispetto all'identità scelta.
${withImages ? 'Le immagini sono allegate nello stesso ordine della lista: guardale davvero e descrivi cosa vedi.' : 'NON vedi le immagini: hai solo le note dell\'artista e i colori misurati. Dichiaralo e non inventare cosa contengono.'}
FORMATO
## Sintesi
## Immagini coerenti (con numero e perché)
## Immagini che portano fuori strada (con numero e perché)
## Cosa manca alla moodboard
## Regole da aggiungere all'identità`,
    user: `${ctx}

${identityText(i)}

MOODBOARD (${kit.mood.length} immagini; colori dominanti MISURATI dall'app; vicinanza alla palette misurata 0–100%):
${kit.mood.map((m, k) => `${k + 1}. ${m.note || 'nessuna nota'} · colori ${m.colors.join(' ')} · vicinanza ${m.fit !== undefined ? Math.round(m.fit * 100) + '%' : 'n.d.'}`).join('\n')}

Analizza seguendo il formato.`,
  }
}

/* ================= A3 · concept artwork ================= */

export function conceptPrompt(ctx: string, kit: ArtKit, format: ArtFormat, n: number, brief: string): RunnerPrompt {
  return {
    task: 'creative', system: SYSTEM, maxTokens: 10000, json: true,
    user: `${ctx}

${identityText(kit.identity!)}
${kit.mood.length ? `\nMOODBOARD (note): ${kit.mood.map((m) => m.note).filter(Boolean).join('; ')}` : ''}
${kit.concepts.length ? `\nCONCEPT GIÀ PRESENTI (non ripeterli): ${kit.concepts.map((c) => c.title).join('; ')}` : ''}
${brief ? `\nRICHIESTA DELL'ARTISTA: ${brief}` : ''}

COMPITO: ${n} CONCEPT PER ${FORMATS[format].label.toUpperCase()}
Note tecniche del formato: ${FORMATS[format].note}
Ogni concept deve essere realizzabile con foto dell'artista, render 3D/codice oppure solo grafica e tipografia (niente generatori di immagini AI). "come_ottenere_immagine": scegli una di queste strade; "scatto_o_render": istruzioni pratiche (luce, inquadratura, oggetto, software 3D/codice, materiali) oppure "nessuna immagine" se solo grafica.
"layout" è uno tra: centrato, griglia, bordo, diagonale, tipografico (serve all'app per preparare una bozza nel compositore).

Schema JSON:
{ "concept": [ { "titolo": "…", "idea": "…", "composizione": "…", "uso_colori": "…", "tipografia": "…", "come_ottenere_immagine": "foto | render 3D | solo grafica", "scatto_o_render": "…", "layout": "griglia", "perche_funziona": "…", "limiti": "…" } ] }`,
  }
}

const LAYOUTS: ArtLayout[] = ['centrato', 'griglia', 'bordo', 'diagonale', 'tipografico']

export function parseConcepts(text: string, format: ArtFormat): ArtConcept[] {
  const j = extractJson(text)
  const out = objs(j.concept).map((o): ArtConcept => {
    const l = str(o.layout).toLowerCase()
    return {
      id: uid(), format, title: str(o.titolo), idea: str(o.idea), composition: str(o.composizione), colorUse: str(o.uso_colori),
      typography: str(o.tipografia), imageSource: str(o.come_ottenere_immagine), shotOr3d: str(o.scatto_o_render),
      layoutHint: LAYOUTS.find((x) => l.includes(x)) ?? 'centrato', why: str(o.perche_funziona), limits: str(o.limiti), createdAt: Date.now(),
    }
  }).filter((c) => c.title && c.idea)
  if (!out.length) throw new Error('La risposta non contiene concept validi. Riprova.')
  return out
}
