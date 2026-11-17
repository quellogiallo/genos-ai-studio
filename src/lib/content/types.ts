/**
 * Content Lab: una CAMPAGNA = l'uscita di un brano/EP con una data, dentro un progetto.
 * Strategia (C1) → idee e script (C2) → calendario (C3) → analisi delle performance (C4).
 */

export type Platform = 'tiktok' | 'instagram'
export const PLATFORM_LABEL: Record<Platform, string> = { tiktok: 'TikTok', instagram: 'Instagram' }

export type ContentFormat = 'performance' | 'visual' | 'faccia' | 'studio'
export const FORMAT_LABEL: Record<ContentFormat, string> = {
  performance: 'Performance (canto, suono, live)',
  visual: 'Solo visual / estetica (3D, clip, grafiche)',
  faccia: 'Metto la faccia / parlo in camera',
  studio: 'Dietro le quinte in studio / Ableton',
}

/* ---------- C1 · strategia ---------- */

export interface Pillar { name: string; description: string; examples: string[] }
export interface CampaignPhase { name: string; fromDay: number; toDay: number; goal: string; perWeek: number; notes: string }
export interface PlatformPlan { platform: string; role: string; formats: string[]; frequency: string; notes: string }
export interface TeaserIdea { title: string; description: string; format: string }

export interface Strategy {
  goal: string
  audience: string
  positioning: string
  pillars: Pillar[]
  phases: CampaignPhase[]
  platforms: PlatformPlan[]
  teasers: TeaserIdea[]
  kpis: string[]
  risks: string[]
  questions: string[]
  updatedAt: number
}

/* ---------- C2 · idee e script ---------- */

export interface ScriptBeat { from: number; to: number; video: string; onScreen: string; audio: string }

export interface ContentIdea {
  id: string
  title: string
  platform: Platform | 'entrambe'
  format: ContentFormat
  pillar: string
  hook: string
  beats: ScriptBeat[]
  durationSec: number
  /** momento del brano da usare (secondi, sul brano collegato) */
  songFrom: number | null
  songTo: number | null
  songWhy: string
  caption: string
  hashtags: string[]
  cta: string
  howTo: string
  why: string
  limits: string
  createdAt: number
}

/* ---------- C3 · calendario ---------- */

export type PostStatus = 'idea' | 'da-girare' | 'pronto' | 'pubblicato'
export const STATUS_LABEL: Record<PostStatus, string> = { idea: 'Idea', 'da-girare': 'Da girare', pronto: 'Pronto', pubblicato: 'Pubblicato' }
export const STATUSES: PostStatus[] = ['idea', 'da-girare', 'pronto', 'pubblicato']

export interface Post {
  id: string
  ideaId?: string
  title: string
  date: string // YYYY-MM-DD
  time: string // HH:MM o vuoto
  platform: Platform
  status: PostStatus
  notes: string
  /** link al post pubblicato (per collegarlo alle statistiche) */
  url: string
}

/* ---------- C4 · statistiche ---------- */

export const METRICS = ['views', 'likes', 'comments', 'shares', 'saves', 'reach', 'follows', 'watchTime', 'avgWatch', 'completion'] as const
export type Metric = (typeof METRICS)[number]
export const METRIC_LABEL: Record<Metric, string> = {
  views: 'Visualizzazioni', likes: 'Mi piace', comments: 'Commenti', shares: 'Condivisioni', saves: 'Salvataggi',
  reach: 'Copertura', follows: 'Nuovi follower', watchTime: 'Tempo di visione totale (s)', avgWatch: 'Visione media (s)', completion: 'Visto per intero (%)',
}

export interface StatRow {
  date: string // YYYY-MM-DD o ''
  title: string
  url: string
  values: Partial<Record<Metric, number>>
}

export interface StatImport {
  id: string
  platform: Platform
  fileName: string
  importedAt: number
  rows: StatRow[]
}

export interface Campaign {
  id: string
  projectId: string
  title: string
  releaseDate: string // YYYY-MM-DD
  /** brano del Music Lab (si usa l'ultima versione analizzata) */
  trackId?: string
  /** video del Video Lab (direzione artistica, schede) */
  videoId?: string
  platforms: Platform[]
  perWeek: number
  formats: ContentFormat[]
  notes: string
  strategy?: Strategy
  ideas: ContentIdea[]
  posts: Post[]
  stats: StatImport[]
  createdAt: number
  updatedAt: number
}

/** giorni dalla data di uscita (negativo = prima) */
export function dayOffset(date: string, release: string) {
  const a = Date.parse(date + 'T12:00:00'), b = Date.parse(release + 'T12:00:00')
  return Math.round((a - b) / 86400000)
}

export function addDays(date: string, n: number) {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function parseTime(t: string): number | null {
  const m = String(t).trim().match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  const n = Number(String(t).replace(',', '.').replace(/s$/, ''))
  return Number.isFinite(n) ? n : null
}
