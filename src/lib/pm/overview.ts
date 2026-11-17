import { db, type Project } from '../db'
import { buildProjectContext } from '../context'
import type { RunnerPrompt } from '../../components/AiRunner'
import { collectEvents, daysFrom, today } from './timeline'

/**
 * Panoramica del progetto: lo stato di ogni modulo calcolato dall'app (non dall'AI),
 * più il prompt per la revisione critica dell'intero progetto.
 */

export interface Step { label: string; done: boolean }
export interface ModuleItem { title: string; link: string; steps: Step[]; extra?: string }
export interface ModuleStatus { area: 'musica' | 'video' | 'contenuti' | 'art'; label: string; link: string; items: ModuleItem[]; empty: string }

export interface Overview {
  modules: ModuleStatus[]
  goals: { total: number; done: number; overdue: number }
  next: { date: string; title: string; kind: string; link: string }[]
}

export async function projectOverview(p: Project): Promise<Overview> {
  const [tracks, videos, campaigns, kit] = await Promise.all([
    db.tracks.where('projectId').equals(p.id).toArray(),
    db.videos.where('projectId').equals(p.id).toArray(),
    db.campaigns.where('projectId').equals(p.id).toArray(),
    db.artkits.where('projectId').equals(p.id).first(),
  ])
  const own = tracks.filter((t) => t.kind !== 'reference')
  const music: ModuleItem[] = []
  for (const t of own) {
    const vs = await db.versions.where('trackId').equals(t.id).toArray()
    const analysed = vs.filter((v) => v.analysis)
    const diag = vs.length ? await db.diagnoses.where('versionId').anyOf(vs.map((v) => v.id)).count() : 0
    music.push({
      title: t.title, link: `/music/${t.id}`,
      steps: [
        { label: 'Versione caricata', done: vs.length > 0 },
        { label: 'Analisi audio', done: analysed.length > 0 },
        { label: 'Diagnosi AI', done: diag > 0 },
        { label: 'Testo', done: !!t.lyrics?.trim() },
      ],
      extra: vs.length ? `${vs.length} versioni` : undefined,
    })
  }
  const video: ModuleItem[] = videos.map((v) => ({
    title: v.title, link: `/video/${v.id}`,
    steps: [
      { label: 'Concept', done: !!v.concept },
      { label: 'Direzione', done: !!v.direction },
      { label: 'Sceneggiatura', done: v.scenes.length > 0 },
      { label: 'Shot list', done: (v.shots ?? []).length > 0 },
      { label: 'Piano riprese', done: !!v.shootPlan?.days.length },
      { label: 'Montaggio', done: !!v.editPlan },
      { label: 'Color', done: !!v.colorPlan },
    ],
  }))
  const content: ModuleItem[] = campaigns.map((c) => {
    const pub = c.posts.filter((x) => x.status === 'pubblicato').length
    return {
      title: c.title, link: `/content/${c.id}`,
      steps: [
        { label: 'Strategia', done: !!c.strategy },
        { label: 'Idee', done: c.ideas.length > 0 },
        { label: 'Calendario', done: c.posts.length > 0 },
        { label: 'Statistiche', done: c.stats.length > 0 },
      ],
      extra: `uscita ${c.releaseDate} · ${pub}/${c.posts.length} post pubblicati`,
    }
  })
  const art: ModuleItem[] = kit ? [{
    title: kit.identity ? `Identità "${kit.identity.name}"` : 'Kit identità', link: '/art',
    steps: [
      { label: 'Identità scelta', done: !!kit.identity },
      { label: 'Moodboard', done: kit.mood.length > 0 },
      { label: 'Concept', done: kit.concepts.length > 0 },
      { label: 'Artwork', done: kit.artworks.length > 0 },
    ],
    extra: kit.artworks.length ? `${kit.artworks.length} artwork` : undefined,
  }] : []

  const t = today()
  const events = collectEvents([p], campaigns)
  return {
    modules: [
      { area: 'musica', label: 'Music Lab', link: '/music', items: music, empty: 'Nessun brano.' },
      { area: 'video', label: 'Video Lab', link: '/video', items: video, empty: 'Nessun video.' },
      { area: 'contenuti', label: 'Content Lab', link: '/content', items: content, empty: 'Nessuna campagna.' },
      { area: 'art', label: 'Art Direction', link: '/art', items: art, empty: 'Identità visiva non ancora creata.' },
    ],
    goals: {
      total: p.goals.length, done: p.goals.filter((g) => g.done).length,
      overdue: p.goals.filter((g) => !g.done && g.deadline && g.deadline < t).length,
    },
    next: events.filter((e) => !e.done && e.date >= t).slice(0, 5).map((e) => ({ date: e.date, title: e.title, kind: e.kind, link: e.link })),
  }
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)

/** Contesto completo e compatto di tutti i moduli, per la revisione. */
export async function buildFullContext(p: Project, ov: Overview): Promise<string> {
  const out = [buildProjectContext(p)]
  const notes = (p.notes ?? []).filter((n) => !n.pinned).slice(-15)
  if (notes.length) out.push('NOTE E IDEE VELOCI DELL\'ARTISTA (non ancora decisioni):\n' + notes.map((n) => `- ${cut(n.text.replace(/\n+/g, ' / '), 240)}`).join('\n'))

  out.push('STATO DEI MODULI (calcolato dall\'app):\n' + ov.modules.map((m) => {
    if (!m.items.length) return `${m.label}: ${m.empty}`
    return `${m.label}:\n` + m.items.map((i) => `- ${i.title}: ${i.steps.map((s) => `${s.label} ${s.done ? '✓' : '✗'}`).join(', ')}${i.extra ? ` (${i.extra})` : ''}`).join('\n')
  }).join('\n'))

  const tracks = await db.tracks.where('projectId').equals(p.id).toArray()
  const music: string[] = []
  for (const t of tracks.filter((x) => x.kind !== 'reference')) {
    const v = (await db.versions.where('trackId').equals(t.id).sortBy('createdAt')).reverse().find((x) => x.analysis)
    const a = v?.analysis
    music.push(`- "${t.title}"${a ? ` · ${a.duration.toFixed(0)} s · BPM ${a.tempo?.bpm ?? 'n.d.'} · tonalità ${a.key?.key ?? 'n.d.'} · ${a.integratedLufs.toFixed(1)} LUFS` : ' · nessuna analisi'}${t.notes ? ` · note: ${cut(t.notes, 200)}` : ''}${t.lyrics?.trim() ? `\n  testo (estratto): ${cut(t.lyrics.trim().replace(/\n+/g, ' / '), 300)}` : ''}`)
  }
  const refs = tracks.filter((x) => x.kind === 'reference')
  if (music.length) out.push('MUSICA:\n' + music.join('\n'))
  if (refs.length) out.push(`REFERENCE MUSICALI: ${refs.map((r) => `${r.artist ? `${r.artist} — ` : ''}${r.title}`).join('; ')}`)

  const videos = await db.videos.where('projectId').equals(p.id).toArray()
  if (videos.length) out.push('VIDEO:\n' + videos.map((v) => `- "${v.title}" (${v.format}, tecniche: ${v.techniques.join(', ') || 'n.d.'})${v.idea ? ` · idea: ${cut(v.idea, 240)}` : ''}${v.direction ? `\n  direzione: ${v.direction.name} — ${cut(v.direction.logline, 200)}` : ''}${v.scenes.length ? `\n  ${v.scenes.length} scene, ${(v.shots ?? []).length} inquadrature` : ''}`).join('\n'))

  const campaigns = await db.campaigns.where('projectId').equals(p.id).toArray()
  if (campaigns.length) out.push('CONTENUTI:\n' + campaigns.map((c) => `- "${c.title}" uscita ${c.releaseDate} (${daysFrom(c.releaseDate)} giorni da oggi) · ${c.platforms.join(', ')} · ${c.perWeek}/settimana${c.strategy ? `\n  obiettivo: ${cut(c.strategy.goal, 200)}\n  pilastri: ${c.strategy.pillars.map((x) => x.name).join(', ')}` : ''}${c.ideas.length ? `\n  idee: ${c.ideas.slice(0, 8).map((i) => i.title).join('; ')}` : ''}`).join('\n'))

  const kit = await db.artkits.where('projectId').equals(p.id).first()
  if (kit?.identity) {
    const i = kit.identity
    out.push(`IDENTITÀ VISIVA "${i.name}": ${cut(i.concept, 300)}\nPalette: ${i.palette.map((x) => `${x.name} ${x.hex}`).join(', ')} · font ${i.fontDisplay} / ${i.fontText}\nDa evitare: ${i.avoid.join('; ')}${i.sonic ? `\nIdentità sonora: ${cut(JSON.stringify(i.sonic), 400)}` : ''}${kit.concepts.length ? `\nConcept artwork: ${kit.concepts.map((c) => `${c.format} "${c.title}"`).join('; ')}` : ''}`)
  }

  if (ov.next.length) out.push('PROSSIME SCADENZE:\n' + ov.next.map((e) => `- ${e.date} (${daysFrom(e.date)} g) ${e.kind}: ${e.title}`).join('\n'))
  out.push(`OBIETTIVI: ${ov.goals.done}/${ov.goals.total} fatti, ${ov.goals.overdue} scaduti. Oggi è ${today()}.`)
  return out.join('\n\n')
}

const SYSTEM = `Sei il direttore creativo di GENOS AI STUDIO e fai la revisione di un intero progetto musicale e audiovisivo.
Sei critico e concreto: non complimenti generici, non riassumere i dati che ti vengono dati.
Usa SOLO le informazioni fornite: se qualcosa manca o non è chiaro, dillo e fai una domanda; non inventare dettagli.
Le DECISIONI sono vincoli: segnala dove il lavoro le contraddice, non metterle in discussione senza un motivo forte.
Le IDEE SCARTATE non vanno riproposte. Rispondi in italiano.`

export function reviewPrompt(ctx: string, focus: string): RunnerPrompt {
  return {
    task: 'critical', system: SYSTEM, maxTokens: 6000, json: false,
    user: `${ctx}
${focus ? `\nCOSA VUOLE CAPIRE L'ARTISTA: ${focus}\n` : ''}
COMPITO: revisione dell'intero progetto. Scrivi in markdown con queste sezioni, brevi e precise:
## Stato reale
2–4 frasi: a che punto è davvero il progetto rispetto alle scadenze.
## Incoerenze tra moduli
Dove musica, video, contenuti e identità visiva non raccontano la stessa cosa (cita gli elementi precisi). Se sono coerenti, dillo e spiega perché.
## Cosa manca
Ciò che manca per arrivare all'uscita, in ordine di importanza.
## Rischi sulle scadenze
Solo in base alle date fornite; se non ci sono date, dillo.
## Prossimi 5 passi
Azioni concrete, ognuna con il modulo dell'app dove farla (Music Lab, Video Lab, Content Lab, Art Direction, Progetto).
## Note da trasformare in decisioni
Tra le note veloci, quali meritano di diventare decisioni o essere scartate, e perché. Se non ci sono note, ometti la sezione.
## Domande
Massimo 3 domande mirate all'artista, solo se servono davvero.`,
  }
}
