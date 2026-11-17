import type { Project } from '../db'
import type { Campaign } from '../content/types'
import { addDays, STATUS_LABEL } from '../content/types'

/**
 * Timeline unica: raccoglie in una sola linea del tempo le date reali già presenti nell'app.
 * Nessuna data viene inventata: obiettivi con scadenza, uscite delle campagne, post del calendario.
 */

export type EventKind = 'obiettivo' | 'uscita' | 'post'
export const KIND_LABEL: Record<EventKind, string> = { obiettivo: 'Obiettivo', uscita: 'Uscita', post: 'Post' }

export interface TimelineEvent {
  id: string
  date: string // YYYY-MM-DD
  time?: string
  kind: EventKind
  projectId: string
  title: string
  detail: string
  done: boolean
  /** percorso nell'app */
  link: string
  /** solo per gli obiettivi: id dell'obiettivo (per spuntarlo dalla timeline) */
  goalId?: string
}

/** Colori dei progetti (lavori su 2–4 progetti insieme): assegnati per ordine di creazione. */
export const PROJECT_COLORS = ['#FFD400', '#F2F2F2', '#5CE1E6', '#FF6B3D', '#B98CFF', '#7CFF8A']

export function projectColors(projects: Project[]): Record<string, string> {
  const out: Record<string, string> = {}
  ;[...projects].sort((a, b) => a.createdAt - b.createdAt).forEach((p, i) => { out[p.id] = PROJECT_COLORS[i % PROJECT_COLORS.length] })
  return out
}

export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function collectEvents(projects: Project[], campaigns: Campaign[]): TimelineEvent[] {
  const out: TimelineEvent[] = []
  const valid = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)
  for (const p of projects) {
    for (const g of p.goals) {
      if (!valid(g.deadline)) continue
      out.push({ id: `g-${g.id}`, date: g.deadline!, kind: 'obiettivo', projectId: p.id, title: g.text, detail: '', done: g.done, link: `/projects/${p.id}`, goalId: g.id })
    }
  }
  const ids = new Set(projects.map((p) => p.id))
  for (const c of campaigns) {
    if (!ids.has(c.projectId)) continue
    if (valid(c.releaseDate)) {
      out.push({ id: `r-${c.id}`, date: c.releaseDate, kind: 'uscita', projectId: c.projectId, title: c.title, detail: 'Data di uscita', done: c.releaseDate < today(), link: `/content/${c.id}` })
    }
    for (const post of c.posts ?? []) {
      if (!valid(post.date)) continue
      out.push({
        id: `p-${post.id}`, date: post.date, time: post.time || undefined, kind: 'post', projectId: c.projectId,
        title: post.title, detail: `${post.platform === 'tiktok' ? 'TikTok' : 'Instagram'} · ${STATUS_LABEL[post.status]} · ${c.title}`,
        done: post.status === 'pubblicato', link: `/content/${c.id}?t=calendario`,
      })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.kind.localeCompare(b.kind))
}

/** Lunedì della settimana di una data. */
export function weekStart(date: string) {
  const d = new Date(date + 'T12:00:00')
  const dow = (d.getDay() + 6) % 7
  return addDays(date, -dow)
}

export function fmtDay(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Giorni fra oggi e la data (negativo = passato). */
export function daysFrom(date: string, from = today()) {
  return Math.round((Date.parse(date + 'T12:00:00') - Date.parse(from + 'T12:00:00')) / 86400000)
}

export function relLabel(n: number) {
  if (n === 0) return 'oggi'
  if (n === 1) return 'domani'
  if (n === -1) return 'ieri'
  return n > 0 ? `tra ${n} g` : `${-n} g fa`
}

/* ---------- conflitti: giorni troppo carichi tra progetti diversi ---------- */

export interface Clash { date: string; events: TimelineEvent[] }

/** Giorni con 2+ scadenze aperte di progetti diversi (o 3+ in totale): possibili sovrapposizioni. */
export function findClashes(events: TimelineEvent[]): Clash[] {
  const by = new Map<string, TimelineEvent[]>()
  for (const e of events) if (!e.done && e.date >= today()) by.set(e.date, [...(by.get(e.date) ?? []), e])
  return [...by.entries()]
    .filter(([, es]) => new Set(es.map((e) => e.projectId)).size >= 2 || es.length >= 3)
    .map(([date, es]) => ({ date, events: es }))
}

/* ---------- esportazione .ics ---------- */

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`)

export function timelineIcs(events: TimelineEvent[], names: Record<string, string>): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GENOS AI STUDIO//Timeline//IT', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:GENOS · Timeline']
  for (const e of events) {
    const d = e.date.replace(/-/g, '')
    lines.push('BEGIN:VEVENT', `UID:${e.id}@genos-ai-studio`, `DTSTAMP:${stamp}`)
    if (e.time) lines.push(`DTSTART:${d}T${e.time.replace(':', '')}00`, 'DURATION:PT30M')
    else lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`)
    lines.push(`SUMMARY:${esc(`[${names[e.projectId] ?? '?'}] ${KIND_LABEL[e.kind]}: ${e.title}`)}`)
    if (e.detail) lines.push(`DESCRIPTION:${esc(e.detail)}`)
    // promemoria il giorno prima per uscite e obiettivi
    if (e.kind !== 'post') lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, 'TRIGGER:-P1D', 'END:VALARM')
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
