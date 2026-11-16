import Dexie, { type EntityTable } from 'dexie'

/**
 * Database locale (IndexedDB) — tutto resta sul tuo dispositivo.
 * Ogni modulo futuro (Music Lab, Video Lab...) aggiungerà le sue tabelle
 * con una nuova versione dello schema, senza perdere i dati esistenti.
 */

export type ProjectType = 'singolo' | 'ep' | 'album' | 'videoclip' | 'campagna' | 'altro'
export type ProjectStatus = 'idea' | 'progettazione' | 'produzione' | 'pubblicato' | 'archiviato'

/** Una decisione creativa presa: l'AI la userà come contesto vincolante. */
export interface Decision {
  id: string
  text: string
  area: 'musica' | 'video' | 'contenuti' | 'art' | 'generale'
  createdAt: number
}

/** Un'idea scartata: l'AI non deve riproporla. */
export interface DiscardedIdea {
  id: string
  text: string
  reason?: string
  createdAt: number
}

export interface Reference {
  id: string
  title: string
  url?: string
  note?: string
  createdAt: number
}

export interface Goal {
  id: string
  text: string
  deadline?: string // YYYY-MM-DD
  done: boolean
}

export interface Project {
  id: string
  name: string
  type: ProjectType
  status: ProjectStatus
  description: string
  decisions: Decision[]
  discarded: DiscardedIdea[]
  references: Reference[]
  goals: Goal[]
  createdAt: number
  updatedAt: number
}

export interface SettingRow {
  key: string
  value: unknown
}

export const db = new Dexie('genos-ai-studio') as Dexie & {
  projects: EntityTable<Project, 'id'>
  settings: EntityTable<SettingRow, 'key'>
}

db.version(1).stores({
  projects: 'id, name, status, updatedAt',
  settings: 'key',
})

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`)

export function newProject(partial: Partial<Project> & { name: string }): Project {
  const now = Date.now()
  return {
    id: uid(),
    type: 'singolo',
    status: 'idea',
    description: '',
    decisions: [],
    discarded: [],
    references: [],
    goals: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export async function saveProject(p: Project) {
  await db.projects.put({ ...p, updatedAt: Date.now() })
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return (row?.value as T) ?? fallback
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value })
}

/** Esporta tutto in JSON (backup manuale). */
export async function exportAll() {
  const projects = await db.projects.toArray()
  return JSON.stringify({ app: 'genos-ai-studio', version: 1, exportedAt: new Date().toISOString(), projects }, null, 2)
}

/** Importa un backup: unisce i progetti (sovrascrive quelli con lo stesso id). */
export async function importAll(json: string): Promise<number> {
  const data = JSON.parse(json)
  if (data?.app !== 'genos-ai-studio' || !Array.isArray(data.projects)) {
    throw new Error('Il file non è un backup valido di GENOS AI STUDIO.')
  }
  await db.projects.bulkPut(data.projects as Project[])
  return data.projects.length
}
