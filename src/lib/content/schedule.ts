import { uid } from '../db'
import { addDays, dayOffset, type Campaign, type ContentIdea, type Platform, type Post } from './types'

/** Lunedì della settimana di una data (YYYY-MM-DD). */
export function weekStart(date: string) {
  const d = new Date(date + 'T12:00:00')
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

/** Limite settimanale in una data: quello della fase della strategia, mai sopra il ritmo della campagna. */
export function weekLimit(c: Campaign, date: string) {
  const off = dayOffset(date, c.releaseDate)
  const ph = c.strategy?.phases.find((p) => off >= p.fromDay && off <= p.toDay)
  return Math.max(1, Math.min(c.perWeek, ph ? Math.ceil(ph.perWeek) : c.perWeek))
}

const PREFERRED_DAYS = [2, 5, 4, 6, 1, 3, 0] // mar, ven, gio, sab, lun, mer, dom: distribuisce nella settimana

/**
 * Prima data libera da oggi (o da `from`) rispettando il limite settimanale.
 * Nessun "orario magico": i giorni sono solo distribuiti nella settimana.
 */
export function nextSlot(c: Campaign, posts: Post[], from?: string): string {
  const today = new Date().toISOString().slice(0, 10)
  // di default si parte dall'inizio della prima fase della strategia (se è nel futuro)
  const phaseStart = c.strategy?.phases[0] ? addDays(c.releaseDate, c.strategy.phases[0].fromDay) : undefined
  const base = from ?? phaseStart
  let start = base && base > today ? base : today
  for (let w = 0; w < 52; w++) {
    const ws = addDays(weekStart(start), w * 7)
    const inWeek = posts.filter((p) => weekStart(p.date) === ws)
    if (inWeek.length >= weekLimit(c, ws)) continue
    const taken = new Set(inWeek.map((p) => p.date))
    for (const dow of PREFERRED_DAYS) {
      const d = addDays(ws, (dow + 6) % 7)
      if (d >= start && !taken.has(d)) return d
    }
    start = addDays(ws, 7)
  }
  return start
}

export function postFromIdea(c: Campaign, idea: ContentIdea, date: string): Post {
  const platform: Platform = idea.platform === 'entrambe' ? c.platforms[0] ?? 'tiktok' : idea.platform
  return { id: uid(), ideaId: idea.id, title: idea.title, date, time: '', platform, status: 'idea', notes: '', url: '' }
}

/** Distribuisce le idee non ancora in calendario negli slot liberi. */
export function autoSchedule(c: Campaign): Post[] {
  const posts = [...c.posts]
  const planned = new Set(posts.map((p) => p.ideaId).filter(Boolean))
  // prima della data di uscita: dal primo giorno della prima fase; altrimenti da oggi
  const firstPhase = c.strategy?.phases[0]
  const from = firstPhase ? addDays(c.releaseDate, firstPhase.fromDay) : undefined
  for (const idea of c.ideas.filter((i) => !planned.has(i.id))) {
    const d = nextSlot(c, posts, from)
    posts.push(postFromIdea(c, idea, d))
  }
  return posts.sort((a, b) => a.date.localeCompare(b.date))
}

/* ---------------- esportazione .ics (calendario del telefono) ---------------- */

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`)

export function toIcs(c: Campaign, posts: Post[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GENOS AI STUDIO//Content Lab//IT', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(c.title)}`]
  for (const p of posts) {
    const idea = c.ideas.find((i) => i.id === p.ideaId)
    const d = p.date.replace(/-/g, '')
    lines.push('BEGIN:VEVENT', `UID:${p.id}@genos-ai-studio`, `DTSTAMP:${stamp}`)
    if (p.time) {
      const t = p.time.replace(':', '') + '00'
      lines.push(`DTSTART:${d}T${t}`, `DURATION:PT30M`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${addDays(p.date, 1).replace(/-/g, '')}`)
    }
    const desc = [idea?.hook && `Hook: ${idea.hook}`, idea?.caption && `Caption: ${idea.caption}`, idea?.hashtags.length && idea.hashtags.join(' '), p.notes].filter(Boolean).join('\n')
    lines.push(`SUMMARY:${esc(`[${p.platform === 'tiktok' ? 'TikTok' : 'Instagram'}] ${p.title}`)}`, `DESCRIPTION:${esc(desc)}`, 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
