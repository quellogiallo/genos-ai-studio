import Dexie, { type EntityTable } from 'dexie'
import type { AudioAnalysis } from './audio/types'
import type { VideoImage, VideoProject } from './video/types'

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

/** Un brano del Music Lab, dentro un progetto. */
export interface Track {
  id: string
  projectId: string
  title: string
  notes: string
  createdAt: number
  updatedAt: number
}

/** Una versione (bounce, mix, master…) di un brano, con la sua analisi. */
export interface TrackVersion {
  id: string
  trackId: string
  label: string
  fileName: string
  mime: string
  size: number
  notes: string
  createdAt: number
  analysis?: AudioAnalysis
  analysisError?: string
}

/** Il file audio originale, separato dai metadati per tenere veloci le liste. */
export interface AudioFile {
  versionId: string
  blob: Blob
}

/** Una diagnosi AI salvata per una versione. */
export interface Diagnosis {
  id: string
  versionId: string
  kind: 'diagnosi' | 'ascolto' | 'confronto'
  /** auto = chiamata API dall'app · manuale = risposta incollata da Claude */
  source: 'auto' | 'manuale'
  provider?: string
  model?: string
  userNote: string
  markdown: string
  createdAt: number
}

export const db = new Dexie('genos-ai-studio') as Dexie & {
  projects: EntityTable<Project, 'id'>
  settings: EntityTable<SettingRow, 'key'>
  tracks: EntityTable<Track, 'id'>
  versions: EntityTable<TrackVersion, 'id'>
  audioFiles: EntityTable<AudioFile, 'versionId'>
  diagnoses: EntityTable<Diagnosis, 'id'>
  videos: EntityTable<VideoProject, 'id'>
  videoImages: EntityTable<VideoImage, 'id'>
}

db.version(1).stores({
  projects: 'id, name, status, updatedAt',
  settings: 'key',
})

db.version(2).stores({
  projects: 'id, name, status, updatedAt',
  settings: 'key',
  tracks: 'id, projectId, updatedAt',
  versions: 'id, trackId, createdAt',
  audioFiles: 'versionId',
})

db.version(3).stores({
  projects: 'id, name, status, updatedAt',
  settings: 'key',
  tracks: 'id, projectId, updatedAt',
  versions: 'id, trackId, createdAt',
  audioFiles: 'versionId',
  diagnoses: 'id, versionId, createdAt',
})

// v4: Video Lab
db.version(4).stores({
  projects: 'id, name, status, updatedAt',
  settings: 'key',
  tracks: 'id, projectId, updatedAt',
  versions: 'id, trackId, createdAt',
  audioFiles: 'versionId',
  diagnoses: 'id, versionId, createdAt',
  videos: 'id, projectId, updatedAt',
  videoImages: 'id, videoId',
})

/** Elimina un video con tutte le sue immagini (moodboard e schede). */
export async function deleteVideo(videoId: string) {
  await db.transaction('rw', db.videos, db.videoImages, async () => {
    await db.videoImages.where('videoId').equals(videoId).delete()
    await db.videos.delete(videoId)
  })
}

/** Elimina un brano con tutte le versioni e i file audio. */
export async function deleteTrack(trackId: string) {
  await db.transaction('rw', [db.tracks, db.versions, db.audioFiles, db.diagnoses], async () => {
    const vs = await db.versions.where('trackId').equals(trackId).primaryKeys()
    await db.diagnoses.where('versionId').anyOf(vs).delete()
    await db.audioFiles.bulkDelete(vs)
    await db.versions.bulkDelete(vs)
    await db.tracks.delete(trackId)
  })
}

export async function deleteVersion(versionId: string) {
  await db.transaction('rw', [db.versions, db.audioFiles, db.diagnoses], async () => {
    await db.diagnoses.where('versionId').equals(versionId).delete()
    await db.audioFiles.delete(versionId)
    await db.versions.delete(versionId)
  })
}

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

/** Esporta tutto in JSON (backup manuale). Non include file audio e immagini. */
export async function exportAll() {
  const projects = await db.projects.toArray()
  const videos = await db.videos.toArray()
  return JSON.stringify({ app: 'genos-ai-studio', version: 2, exportedAt: new Date().toISOString(), projects, videos }, null, 2)
}

/** Importa un backup: unisce progetti e video (sovrascrive quelli con lo stesso id). */
export async function importAll(json: string): Promise<number> {
  const data = JSON.parse(json)
  if (data?.app !== 'genos-ai-studio' || !Array.isArray(data.projects)) {
    throw new Error('Il file non è un backup valido di GENOS AI STUDIO.')
  }
  await db.projects.bulkPut(data.projects as Project[])
  if (Array.isArray(data.videos)) await db.videos.bulkPut(data.videos as VideoProject[])
  return data.projects.length
}
