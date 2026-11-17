import { buildProjectContext } from '../context'
import { uid, type Project, type Track, type TrackVersion } from '../db'
import type { VideoProject } from '../video/types'
import { extractJson } from '../video/prompts'
import type { RunnerPrompt } from '../../components/AiRunner'
import {
  FORMAT_LABEL, PLATFORM_LABEL, fmtSec, parseTime,
  type Campaign, type ContentFormat, type ContentIdea, type Platform, type Strategy, type StatImport, METRICS, METRIC_LABEL,
} from './types'

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])
const objs = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [])
const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d }

export interface ContentSources {
  project?: Project
  track?: Track
  version?: TrackVersion
  video?: VideoProject
}

const SYSTEM = `Sei lo stratega dei contenuti e direttore creativo del Content Lab di GENOS AI STUDIO. Lavori per Genos, musicista di synthpop sperimentale indipendente, con mezzi piccoli.

PRINCIPI
- L'identità artistica viene prima della viralità: niente trend imbarazzanti o fuori tono. Ma sii concreto su cosa fa funzionare un contenuto (hook nei primi 2 secondi, ritmo, loop, testo a schermo, motivo per salvare o condividere).
- Rispetta i vincoli dell'artista: piattaforme, ritmo settimanale, tipi di contenuto che è disposto a fare. Non proporre mai formati esclusi.
- Usa i dati misurati del brano quando ci sono (sezioni, loudness, BPM): non inventare minutaggi o dati.
- Rispetta le decisioni creative del progetto e non riproporre idee scartate.
- Critico e onesto: per ogni proposta spiega perché funziona e il suo limite. Originalità non è casualità.
- Non inventare statistiche di piattaforma, orari "magici" o numeri di settore: se citi una pratica comune, presentala come tale.
- Italiano; hashtag e caption nella lingua più adatta al pubblico indicato.
- Rispondi SOLO con JSON valido nello schema richiesto.`

/** Contesto completo della campagna per l'AI. */
export function buildContentContext(c: Campaign, s: ContentSources): string {
  const out: string[] = []
  if (s.project) out.push(`CONTESTO DEL PROGETTO\n${buildProjectContext(s.project)}`)
  out.push(`CAMPAGNA: "${c.title}" · uscita il ${c.releaseDate}
Piattaforme: ${c.platforms.map((p) => PLATFORM_LABEL[p]).join(', ')}
Ritmo sostenibile: ${c.perWeek} contenuti a settimana (non superarlo)
Tipi di contenuto che l'artista è disposto a fare: ${c.formats.map((f) => FORMAT_LABEL[f]).join('; ')}
Tipi ESCLUSI: ${(Object.keys(FORMAT_LABEL) as ContentFormat[]).filter((f) => !c.formats.includes(f)).map((f) => FORMAT_LABEL[f]).join('; ') || 'nessuno'}${c.notes ? `\nNote dell'artista: ${c.notes}` : ''}`)
  const a = s.version?.analysis
  if (s.track) {
    const lines = [`BRANO: "${s.track.title}"`]
    if (a) {
      lines.push(`Durata ${fmtSec(a.duration)} · BPM stimato ${a.tempo ? a.tempo.bpm : 'n.d.'} · tonalità stimata ${a.key ? a.key.key : 'n.d.'} · loudness ${a.integratedLufs.toFixed(1)} LUFS`)
      lines.push('Sezioni misurate (stessa lettera = materiale simile; loudness media):')
      a.sections.forEach((x) => lines.push(`- ${x.label} ${fmtSec(x.start)}–${fmtSec(x.end)} · ${x.loudness.toFixed(1)} LUFS`))
      const loud = [...a.sections].sort((p, q) => q.loudness - p.loudness)[0]
      if (loud) lines.push(`Sezione più energica: ${loud.label} ${fmtSec(loud.start)}–${fmtSec(loud.end)}`)
    } else lines.push('Nessuna versione analizzata: niente minutaggi misurati.')
    if (s.track.lyrics?.trim()) lines.push(`TESTO (estratto):\n${s.track.lyrics.trim().slice(0, 1500)}`)
    out.push(lines.join('\n'))
  }
  const v = s.video
  if (v?.direction) {
    out.push(`DIREZIONE ARTISTICA DEL VIDEO "${v.title}": ${v.direction.name} — ${v.direction.logline}
Look: ${v.direction.look} · Luce: ${v.direction.light} · Texture: ${v.direction.texture}
Palette: ${v.direction.palette.map((p) => `${p.name} ${p.hex}`).join(', ')}
Regole: ${v.direction.rules.join('; ')}${v.direction.avoid.length ? `\nDa evitare: ${v.direction.avoid.join('; ')}` : ''}${v.sheets.length ? `\nSchede (personaggi, luoghi, oggetti ricorrenti): ${v.sheets.map((x) => `${x.name} (${x.kind})`).join(', ')}` : ''}`)
  }
  if (c.strategy) {
    const st = c.strategy
    out.push(`STRATEGIA APPROVATA
Obiettivo: ${st.goal}
Pubblico: ${st.audience}
Posizionamento: ${st.positioning}
Pilastri: ${st.pillars.map((p) => `${p.name} (${p.description})`).join('; ')}
Fasi: ${st.phases.map((p) => `${p.name} dal giorno ${p.fromDay} al ${p.toDay} rispetto all'uscita, ${p.perWeek}/settimana — ${p.goal}`).join('; ')}`)
  }
  if (c.ideas.length) out.push(`IDEE GIÀ PRESENTI (non ripeterle): ${c.ideas.map((i) => i.title).join('; ')}`)
  return out.join('\n\n')
}

/* ================= C1 · strategia ================= */

export function strategyPrompt(ctx: string, note: string): RunnerPrompt {
  return {
    task: 'creative', system: SYSTEM, maxTokens: 10000, json: true,
    user: `${ctx}
${note ? `\nINDICAZIONE DELL'ARTISTA: ${note}\n` : ''}
COMPITO: STRATEGIA DI CAMPAGNA
Costruisci la strategia per l'uscita. Le fasi sono definite in giorni rispetto alla data di uscita (es. da -21 a -1 = teaser; 0 = giorno di uscita; da 1 a 28 = dopo l'uscita). La somma dei contenuti per settimana non deve superare il ritmo sostenibile.

Schema JSON:
{
  "obiettivo": "obiettivo principale misurabile e realistico per un artista indipendente",
  "pubblico": "a chi parliamo, con dettagli concreti (non 'giovani 18-34')",
  "posizionamento": "come presentare Genos in questa campagna, in 2 frasi",
  "pilastri": [ { "nome": "…", "descrizione": "…", "esempi": ["…"] } ],
  "fasi": [ { "nome": "Teaser", "da_giorno": -21, "a_giorno": -1, "obiettivo": "…", "contenuti_settimana": 1, "note": "…" } ],
  "piattaforme": [ { "piattaforma": "TikTok", "ruolo": "…", "formati": ["…"], "frequenza": "…", "note": "…" } ],
  "idee_teaser": [ { "titolo": "…", "descrizione": "…", "formato": "performance o visual" } ],
  "kpi": ["cosa misurare e perché"],
  "rischi": ["rischio + come ridurlo"],
  "domande": ["massimo 3, solo se servono davvero"]
}`,
  }
}

export function parseStrategy(text: string): Strategy {
  const j = extractJson(text)
  const st: Strategy = {
    goal: str(j.obiettivo), audience: str(j.pubblico), positioning: str(j.posizionamento),
    pillars: objs(j.pilastri).map((o) => ({ name: str(o.nome), description: str(o.descrizione), examples: list(o.esempi) })).filter((p) => p.name),
    phases: objs(j.fasi).map((o) => ({ name: str(o.nome), fromDay: Math.round(num(o.da_giorno)), toDay: Math.round(num(o.a_giorno)), goal: str(o.obiettivo), perWeek: Math.max(0, num(o.contenuti_settimana, 1)), notes: str(o.note) }))
      .filter((p) => p.name).sort((a, b) => a.fromDay - b.fromDay),
    platforms: objs(j.piattaforme).map((o) => ({ platform: str(o.piattaforma), role: str(o.ruolo), formats: list(o.formati), frequency: str(o.frequenza), notes: str(o.note) })).filter((p) => p.platform),
    teasers: objs(j.idee_teaser).map((o) => ({ title: str(o.titolo), description: str(o.descrizione), format: str(o.formato) })).filter((t) => t.title),
    kpis: list(j.kpi), risks: list(j.rischi), questions: list(j.domande), updatedAt: Date.now(),
  }
  if (!st.goal && !st.pillars.length) throw new Error('La risposta non contiene una strategia. Riprova.')
  return st
}

/* ================= C2 · idee e script ================= */

export function ideasPrompt(ctx: string, c: Campaign, n: number, brief: string, duration: number | null): RunnerPrompt {
  return {
    task: 'creative', system: SYSTEM, maxTokens: 14000, json: true,
    user: `${ctx}
${brief ? `\nRICHIESTA DELL'ARTISTA: ${brief}\n` : ''}
COMPITO: ${n} IDEE DI VIDEO BREVI CON SCRIPT
- Solo formati tra quelli che l'artista accetta (${c.formats.join(', ')}); piattaforme: ${c.platforms.join(', ')}.
- Ogni idea deve essere realizzabile da una persona sola o quasi, con telefono o attrezzatura minima.
- "hook": cosa succede e cosa si legge nei primi 2 secondi, concreto.
- "scaletta": segmenti consecutivi in secondi che coprono tutta la durata.
- "momento_brano": la parte del brano da usare come audio, in mm:ss${duration ? ` (il brano dura ${fmtSec(duration)}: resta dentro)` : ''}. Scegli in base alle sezioni misurate e spiega perché.
- Idee diverse tra loro (pilastro, formato, meccanica), coerenti con la strategia e la direzione artistica se presenti.

Schema JSON:
{
  "idee": [
    {
      "titolo": "…",
      "piattaforma": "tiktok | instagram | entrambe",
      "formato": "performance | visual",
      "pilastro": "nome del pilastro",
      "hook": "…",
      "durata_sec": 15,
      "scaletta": [ { "da": 0, "a": 2, "video": "cosa si vede", "testo_a_schermo": "…", "audio": "…" } ],
      "momento_brano": { "da": "0:45", "a": "1:00", "perche": "…" },
      "caption": "…",
      "hashtag": ["#…"],
      "cta": "invito all'azione naturale, non forzato",
      "come_girarlo": "inquadratura, luce, attrezzatura minima, tempo necessario",
      "perche_funziona": "…",
      "limiti": "…"
    }
  ]
}`,
  }
}

export function parseIdeas(text: string, duration: number | null): ContentIdea[] {
  const j = extractJson(text)
  const ideas = objs(j.idee).map((o): ContentIdea => {
    const m = (o.momento_brano ?? {}) as Record<string, unknown>
    let from = parseTime(str(m.da)), to = parseTime(str(m.a))
    if (from !== null && to !== null && to <= from) to = null
    if (duration && from !== null && from >= duration) { from = null; to = null }
    if (duration && to !== null && to > duration) to = duration
    const plat = str(o.piattaforma).toLowerCase()
    const fmt = str(o.formato).toLowerCase()
    return {
      id: uid(), title: str(o.titolo), platform: plat.includes('tik') ? 'tiktok' : plat.includes('insta') ? 'instagram' : 'entrambe',
      format: (fmt.includes('perform') ? 'performance' : fmt.includes('faccia') ? 'faccia' : fmt.includes('studio') ? 'studio' : 'visual') as ContentFormat,
      pillar: str(o.pilastro), hook: str(o.hook),
      beats: objs(o.scaletta).map((b) => ({ from: num(b.da), to: num(b.a), video: str(b.video), onScreen: str(b.testo_a_schermo), audio: str(b.audio) })),
      durationSec: Math.max(1, num(o.durata_sec, 15)), songFrom: from, songTo: to, songWhy: str(m.perche),
      caption: str(o.caption), hashtags: list(o.hashtag).map((h) => (h.startsWith('#') ? h : `#${h}`)), cta: str(o.cta),
      howTo: str(o.come_girarlo), why: str(o.perche_funziona), limits: str(o.limiti), createdAt: Date.now(),
    }
  }).filter((i) => i.title && i.hook)
  if (!ideas.length) throw new Error('La risposta non contiene idee valide. Riprova.')
  return ideas
}

/* ================= C4 · analisi ================= */

export function statsSummary(c: Campaign): string {
  const lines: string[] = []
  for (const imp of c.stats) {
    lines.push(`\nFILE ${imp.fileName} (${PLATFORM_LABEL[imp.platform]}), ${imp.rows.length} righe`)
    const cols = METRICS.filter((m) => imp.rows.some((r) => r.values[m] !== undefined))
    lines.push(`Colonne: data, titolo, ${cols.map((m) => METRIC_LABEL[m]).join(', ')}`)
    imp.rows.slice(0, 120).forEach((r) => lines.push(`- ${r.date || 's.d.'} | ${r.title.slice(0, 80) || 'senza titolo'} | ${cols.map((m) => `${m}=${r.values[m] ?? ''}`).join(' ')}`))
    if (imp.rows.length > 120) lines.push(`(altre ${imp.rows.length - 120} righe omesse)`)
  }
  return lines.join('\n')
}

export function analysisPrompt(ctx: string, c: Campaign, computed: string, question: string): RunnerPrompt {
  return {
    task: 'critical', json: false, maxTokens: 8000,
    system: `Sei l'analista dei contenuti di GENOS AI STUDIO. Lavori per Genos, musicista indipendente di synthpop sperimentale.
REGOLE
1. Usa SOLO i dati forniti. Non inventare medie di settore, benchmark o numeri che non sono nei dati.
2. Ogni affermazione cita i numeri (es. "il video del 12/03 ha 3,2× le visualizzazioni medie").
3. Con pochi dati (meno di ~8 contenuti) dillo chiaramente: sono indizi, non conclusioni.
4. Correlazione non è causa: proponi ipotesi da verificare con un test, non certezze.
5. Collega i risultati ai pilastri e alle idee della campagna quando possibile.
6. Rispetta l'identità artistica: non suggerire di inseguire formati che l'artista ha escluso.
7. Italiano, markdown, critico e concreto.

FORMATO
## Sintesi
## Cosa funziona (con numeri)
## Cosa non funziona (con numeri)
## Ipotesi da testare
Per ognuna: **Ipotesi**, **Test** (cosa pubblicare e come confrontarlo), **Metrica da guardare**
## Prossimi contenuti
3 indicazioni concrete per le prossime 2 settimane, nel ritmo di ${c.perWeek} a settimana.
## Limiti di questa analisi`,
    user: `${ctx}

CALCOLI DELL'APP (affidabili):
${computed}

DATI GREZZI:
${statsSummary(c)}

${question ? `DOMANDA DELL'ARTISTA: ${question}\n\n` : ''}Analizza seguendo esattamente il formato.`,
  }
}

export type { Platform, StatImport }
