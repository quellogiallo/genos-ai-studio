import { db, type Project } from '../db'

/**
 * Ricerca unica: cerca in tutto ciò che è salvato per i progetti (testo reale, nessuna AI).
 * Si costruisce un indice in memoria a ogni ricerca: i dati sono pochi e restano sul dispositivo.
 */

export type Area = 'progetto' | 'note' | 'musica' | 'video' | 'contenuti' | 'art' | 'ai'
export const AREA_LABEL: Record<Area, string> = {
  progetto: 'Progetto', note: 'Note', musica: 'Musica', video: 'Video', contenuti: 'Contenuti', art: 'Art', ai: 'Risultati AI',
}

export interface Entry {
  projectId: string
  area: Area
  /** dove si trova (es. "Video · Fossile · scena 3") */
  where: string
  text: string
  link: string
}

const SKIP_KEY = /^(id|.*Id|.*Ids|createdAt|updatedAt|at|imageId|bg|ink|accent|hex|base64|blob|fit|colors|time|from|to|size|mime)$/
const LOOKS_CODE = /^(#[0-9a-f]{3,8}|[A-Za-z0-9+/=]{80,})$/i

/** Tutte le stringhe utili di un oggetto, unite. */
export function flat(obj: unknown, depth = 0): string {
  if (obj == null || depth > 8) return ''
  if (typeof obj === 'string') return LOOKS_CODE.test(obj.trim()) ? '' : obj
  if (typeof obj === 'number' || typeof obj === 'boolean') return ''
  if (Array.isArray(obj)) return obj.map((x) => flat(x, depth + 1)).filter(Boolean).join(' · ')
  if (typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>)
      .filter(([k]) => !SKIP_KEY.test(k))
      .map(([, v]) => flat(v, depth + 1)).filter(Boolean).join(' · ')
  }
  return ''
}

export async function buildIndex(projects: Project[]): Promise<Entry[]> {
  const out: Entry[] = []
  const add = (e: Entry) => { if (e.text.trim()) out.push(e) }
  const pids = projects.map((p) => p.id)
  const [tracks, videos, campaigns, kits, chats] = await Promise.all([
    db.tracks.where('projectId').anyOf(pids).toArray(),
    db.videos.where('projectId').anyOf(pids).toArray(),
    db.campaigns.where('projectId').anyOf(pids).toArray(),
    db.artkits.where('projectId').anyOf(pids).toArray(),
    db.chats.where('projectId').anyOf(pids).toArray(),
  ])
  const versions = tracks.length ? await db.versions.where('trackId').anyOf(tracks.map((t) => t.id)).toArray() : []
  const diagnoses = versions.length ? await db.diagnoses.where('versionId').anyOf(versions.map((v) => v.id)).toArray() : []
  const refOwner = new Map<string, { projectId: string; where: string; link: string }>()
  pids.forEach((id) => refOwner.set(id, { projectId: id, where: 'Progetto', link: `/projects/${id}` }))
  tracks.forEach((t) => refOwner.set(t.id, { projectId: t.projectId, where: `Brano · ${t.title}`, link: `/music/${t.id}` }))
  campaigns.forEach((c) => refOwner.set(c.id, { projectId: c.projectId, where: `Campagna · ${c.title}`, link: `/content/${c.id}` }))
  kits.forEach((k) => refOwner.set(k.id, { projectId: k.projectId, where: 'Art Lab', link: '/art?t=moodboard' }))
  const aiNotes = await db.aiNotes.where('refId').anyOf([...refOwner.keys()]).toArray()

  for (const p of projects) {
    const L = `/projects/${p.id}`
    add({ projectId: p.id, area: 'progetto', where: 'Concept', text: `${p.name} · ${p.description}`, link: L })
    p.decisions.forEach((d) => add({ projectId: p.id, area: 'progetto', where: `Decisione · ${d.area}`, text: d.text, link: L }))
    p.discarded.forEach((d) => add({ projectId: p.id, area: 'progetto', where: 'Idea scartata', text: `${d.text}${d.reason ? ` — ${d.reason}` : ''}`, link: L }))
    p.references.forEach((r) => add({ projectId: p.id, area: 'progetto', where: 'Reference', text: [r.title, r.note, r.url].filter(Boolean).join(' — '), link: L }))
    p.goals.forEach((g) => add({ projectId: p.id, area: 'progetto', where: `Obiettivo${g.deadline ? ` · ${g.deadline}` : ''}`, text: g.text, link: L }))
    ;(p.notes ?? []).forEach((n) => add({ projectId: p.id, area: 'note', where: `Nota · ${new Date(n.createdAt).toLocaleDateString('it-IT')}`, text: n.text, link: `${L}#note` }))
  }
  for (const t of tracks) {
    add({ projectId: t.projectId, area: 'musica', where: `${t.kind === 'reference' ? 'Reference' : 'Brano'} · ${t.title}`, text: [t.title, t.artist, t.notes, (t.refFocus ?? []).join(', ')].filter(Boolean).join(' — '), link: `/music/${t.id}` })
    if (t.lyrics) add({ projectId: t.projectId, area: 'musica', where: `Testo · ${t.title}`, text: t.lyrics, link: `/music/${t.id}/lyrics` })
  }
  const trackOf = new Map(tracks.map((t) => [t.id, t]))
  for (const v of versions) {
    const t = trackOf.get(v.trackId); if (!t) continue
    add({ projectId: t.projectId, area: 'musica', where: `Versione · ${t.title} · ${v.label}`, text: [v.label, v.fileName, v.notes].filter(Boolean).join(' — '), link: `/music/${t.id}` })
  }
  const verOf = new Map(versions.map((v) => [v.id, v]))
  for (const d of diagnoses) {
    const v = verOf.get(d.versionId); const t = v && trackOf.get(v.trackId); if (!t || !v) continue
    add({ projectId: t.projectId, area: 'ai', where: `Diagnosi · ${t.title} · ${v.label}`, text: `${d.userNote} ${d.markdown}`, link: `/music/${t.id}` })
  }
  for (const c of chats) {
    add({ projectId: c.projectId, area: 'musica', where: `Ableton Assistant · ${c.title}`, text: c.messages.map((m) => m.content).join('\n'), link: `/music/assistant/${c.id}` })
  }
  for (const v of videos) {
    const L = `/video/${v.id}`
    add({ projectId: v.projectId, area: 'video', where: `Video · ${v.title}`, text: [v.title, v.idea, v.arc, flat(v.concept), flat(v.direction)].filter(Boolean).join(' — '), link: L })
    v.scenes.forEach((s, i) => add({ projectId: v.projectId, area: 'video', where: `Video · ${v.title} · scena ${i + 1}`, text: flat(s), link: L }))
    v.sheets.forEach((s) => add({ projectId: v.projectId, area: 'video', where: `Video · ${v.title} · scheda`, text: flat(s), link: L }))
    ;(v.shots ?? []).forEach((s, i) => add({ projectId: v.projectId, area: 'video', where: `Video · ${v.title} · inquadratura ${i + 1}`, text: flat(s), link: L }))
    const rest = flat({ mood: v.mood, plan: v.shootPlan, edit: v.editPlan, color: v.colorPlan })
    if (rest) add({ projectId: v.projectId, area: 'video', where: `Video · ${v.title} · moodboard, riprese, montaggio, color`, text: rest, link: L })
  }
  for (const c of campaigns) {
    const L = `/content/${c.id}`
    add({ projectId: c.projectId, area: 'contenuti', where: `Campagna · ${c.title}`, text: [c.title, c.notes, flat(c.strategy)].filter(Boolean).join(' — '), link: L })
    c.ideas.forEach((i) => add({ projectId: c.projectId, area: 'contenuti', where: `Idea · ${c.title}`, text: flat(i), link: `${L}?t=idee` }))
    c.posts.forEach((p) => add({ projectId: c.projectId, area: 'contenuti', where: `Post · ${p.date} · ${c.title}`, text: [p.title, p.notes, p.url].filter(Boolean).join(' — '), link: `${L}?t=calendario` }))
  }
  for (const k of kits) {
    if (k.identity) add({ projectId: k.projectId, area: 'art', where: `Identità · ${k.identity.name}`, text: flat(k.identity), link: '/art?t=identita' })
    k.proposals.filter((x) => x.name !== k.identity?.name).forEach((x) => add({ projectId: k.projectId, area: 'art', where: `Direzione proposta · ${x.name}`, text: flat(x), link: '/art?t=identita' }))
    k.mood.forEach((m) => add({ projectId: k.projectId, area: 'art', where: 'Moodboard', text: m.note, link: '/art?t=moodboard' }))
    k.concepts.forEach((c) => add({ projectId: k.projectId, area: 'art', where: `Concept · ${c.format}`, text: flat(c), link: '/art?t=concept' }))
    k.artworks.forEach((a) => add({ projectId: k.projectId, area: 'art', where: `Artwork · ${a.format}`, text: [a.name, a.title, a.subtitle, a.small].filter(Boolean).join(' — '), link: '/art?t=compositore' }))
  }
  for (const n of aiNotes) {
    const o = refOwner.get(n.refId); if (!o) continue
    add({ projectId: o.projectId, area: 'ai', where: `${o.where} · ${n.userNote || n.kind}`, text: n.markdown, link: o.link })
  }
  return out
}

/** minuscolo e senza accenti, per confronti tolleranti */
export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export interface Hit extends Entry { snippet: string; score: number }

/** Tutte le parole devono esserci (frase tra virgolette = esatta). */
export function search(index: Entry[], query: string): Hit[] {
  const terms = [...query.matchAll(/"([^"]+)"|(\S+)/g)].map((m) => norm(m[1] ?? m[2])).filter((t) => t.length >= 2)
  if (!terms.length) return []
  const hits: Hit[] = []
  for (const e of index) {
    const t = norm(e.text), w = norm(e.where)
    if (!terms.every((q) => t.includes(q) || w.includes(q))) continue
    const score = terms.reduce((s, q) => s + (w.includes(q) ? 3 : 0) + Math.min(5, t.split(q).length - 1), 0) + (e.area === 'progetto' || e.area === 'note' ? 1 : 0)
    hits.push({ ...e, snippet: snippet(e.text, terms[0]), score })
  }
  return hits.sort((a, b) => b.score - a.score)
}

function snippet(text: string, term: string, span = 90): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const i = norm(clean).indexOf(term)
  if (i < 0) return clean.slice(0, span * 2) + (clean.length > span * 2 ? '…' : '')
  const a = Math.max(0, i - span), b = Math.min(clean.length, i + term.length + span)
  return (a > 0 ? '…' : '') + clean.slice(a, b) + (b < clean.length ? '…' : '')
}
