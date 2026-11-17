import Dexie, { type EntityTable } from 'dexie'
import dexieCloud from 'dexie-cloud-addon'
import { CLOUD_DB_URL, LOCAL_ONLY_TABLES } from './cloudConfig'
import type { Campaign } from './content/types'
import type { ArtKit } from './art/types'
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

/** Nota o idea veloce del progetto (#tag nel testo). */
export interface QuickNote {
  id: string
  text: string
  tags: string[]
  pinned?: boolean
  createdAt: number
  updatedAt: number
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
  /** Project Manager: note e idee veloci */
  notes?: QuickNote[]
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
  /** 'reference' = brano di un altro artista usato come riferimento (default: brano tuo) */
  kind?: 'brano' | 'reference'
  /** per le reference: artista */
  artist?: string
  /** per le reference: aspetti da prendere come riferimento */
  refFocus?: string[]
  /** testo del brano (Music Lab · Testi) */
  lyrics?: string
  lyricsUpdatedAt?: number
}

/** Conversazione con l'Ableton Assistant. */
export interface Chat {
  id: string
  projectId: string
  /** versione di un brano collegata: i suoi dati misurati entrano nel contesto */
  versionId?: string
  title: string
  messages: { role: 'user' | 'assistant'; content: string; model?: string; at: number }[]
  createdAt: number
  updatedAt: number
}

/** Risultati AI generici legati a un brano o a un progetto (analisi testi, concept beat…). */
export interface AiNote {
  id: string
  scope: 'track' | 'project'
  refId: string
  kind: 'testo-analisi' | 'testo-brainstorming' | 'beat' | 'contenuti-analisi' | 'moodboard-critica' | 'progetto-revisione'
  userNote: string
  markdown: string
  /** dati strutturati (es. concept beat in JSON) */
  data?: unknown
  model?: string
  createdAt: number
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

/** true se la sincronizzazione cloud è configurata (vedi cloudConfig.ts) */
export const CLOUD_ENABLED = !!CLOUD_DB_URL

export const db = new Dexie('genos-ai-studio', CLOUD_ENABLED ? { addons: [dexieCloud] } : undefined) as Dexie & {
  projects: EntityTable<Project, 'id'>
  settings: EntityTable<SettingRow, 'key'>
  tracks: EntityTable<Track, 'id'>
  versions: EntityTable<TrackVersion, 'id'>
  audioFiles: EntityTable<AudioFile, 'versionId'>
  diagnoses: EntityTable<Diagnosis, 'id'>
  videos: EntityTable<VideoProject, 'id'>
  videoImages: EntityTable<VideoImage, 'id'>
  chats: EntityTable<Chat, 'id'>
  aiNotes: EntityTable<AiNote, 'id'>
  campaigns: EntityTable<Campaign, 'id'>
  artkits: EntityTable<ArtKit, 'id'>
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

// v5: Music Lab F4 (Ableton Assistant, testi, concept beat)
db.version(5).stores({
  projects: 'id, name, status, updatedAt',
  settings: 'key',
  tracks: 'id, projectId, updatedAt',
  versions: 'id, trackId, createdAt',
  audioFiles: 'versionId',
  diagnoses: 'id, versionId, createdAt',
  videos: 'id, projectId, updatedAt',
  videoImages: 'id, videoId',
  chats: 'id, projectId, updatedAt',
  aiNotes: 'id, refId, [refId+kind], createdAt',
})

// v6: Content Lab (campagne con strategia, idee, calendario e statistiche)
db.version(6).stores({
  projects: 'id, name, status, updatedAt',
  settings: 'key',
  tracks: 'id, projectId, updatedAt',
  versions: 'id, trackId, createdAt',
  audioFiles: 'versionId',
  diagnoses: 'id, versionId, createdAt',
  videos: 'id, projectId, updatedAt',
  videoImages: 'id, videoId',
  chats: 'id, projectId, updatedAt',
  aiNotes: 'id, refId, [refId+kind], createdAt',
  campaigns: 'id, projectId, updatedAt',
})

// v7: Art Direction Lab (un kit di identità per progetto)
db.version(7).stores({
  projects: 'id, name, status, updatedAt',
  settings: 'key',
  tracks: 'id, projectId, updatedAt',
  versions: 'id, trackId, createdAt',
  audioFiles: 'versionId',
  diagnoses: 'id, versionId, createdAt',
  videos: 'id, projectId, updatedAt',
  videoImages: 'id, videoId',
  chats: 'id, projectId, updatedAt',
  aiNotes: 'id, refId, [refId+kind], createdAt',
  campaigns: 'id, projectId, updatedAt',
  artkits: 'id, projectId, updatedAt',
})

/** Elimina un video con tutte le sue immagini (moodboard e schede). */
export async function deleteVideo(videoId: string) {
  await db.transaction('rw', db.videos, db.videoImages, async () => {
    await db.videoImages.where('videoId').equals(videoId).delete()
    await db.videos.delete(videoId)
  })
}


// Sincronizzazione cloud: va configurata prima che il database venga aperto.
if (CLOUD_ENABLED) {
  db.cloud.configure({
    databaseUrl: CLOUD_DB_URL,
    requireAuth: false, // l'app funziona anche senza login; il login attiva la sincronizzazione
    customLoginGui: true, // finestra di accesso disegnata dall'app (components/CloudLogin.tsx)
    unsyncedTables: LOCAL_ONLY_TABLES,
  })
}

/** Elimina un brano con tutte le versioni e i file audio. */
export async function deleteTrack(trackId: string) {
  await db.transaction('rw', [db.tracks, db.versions, db.audioFiles, db.diagnoses, db.aiNotes], async () => {
    const vs = await db.versions.where('trackId').equals(trackId).primaryKeys()
    await db.aiNotes.where('refId').equals(trackId).delete()
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
/* ---------------- backup ---------------- */

const toB64 = (u8: Uint8Array) => {
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromB64 = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0))

/** Versione senza oggetti binari: lo spettrogramma diventa testo base64. */
function versionOut(v: TrackVersion) {
  if (!v.analysis) return v
  return { ...v, analysis: { ...v.analysis, spectrogram: { ...v.analysis.spectrogram, data: toB64(v.analysis.spectrogram.data) } } }
}
function versionIn(v: TrackVersion): TrackVersion {
  const d = v.analysis?.spectrogram?.data as unknown
  if (v.analysis && typeof d === 'string') return { ...v, analysis: { ...v.analysis, spectrogram: { ...v.analysis.spectrogram, data: fromB64(d) } } }
  return v
}

const blobToB64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result).split(',')[1] ?? '')
  r.onerror = () => rej(new Error('Lettura di un file audio non riuscita.'))
  r.readAsDataURL(b)
})

export interface BackupStats { projects: number; tracks: number; versions: number; /** file audio + immagini */ audio: number; texts: number }

/**
 * Esporta tutto in JSON: progetti, Video Lab (testi), Music Lab (brani, testi, versioni con analisi,
 * diagnosi, conversazioni Ableton, concept beat). I file audio solo se richiesto (file molto più grande).
 * Restituisce un Blob costruito a pezzi, per non tenere in memoria un'unica stringa enorme.
 */
export async function exportAll(opts: { includeAudio?: boolean } = {}): Promise<Blob> {
  const [projects, videos, tracks, versions, diagnoses, chats, aiNotes, campaigns, artkits] = await Promise.all([
    db.projects.toArray(), db.videos.toArray(), db.tracks.toArray(), db.versions.toArray(),
    db.diagnoses.toArray(), db.chats.toArray(), db.aiNotes.toArray(), db.campaigns.toArray(), db.artkits.toArray(),
  ])
  const head = { app: 'genos-ai-studio', version: 3, exportedAt: new Date().toISOString(), includesAudio: !!opts.includeAudio }
  const parts: BlobPart[] = [JSON.stringify({ ...head, projects, videos, tracks, versions: versions.map(versionOut), diagnoses, chats, aiNotes, campaigns, artkits }).slice(0, -1)]
  if (opts.includeAudio) {
    parts.push(',"audioFiles":[')
    let first = true
    for (const v of versions) {
      const f = await db.audioFiles.get(v.id)
      if (!f) continue
      parts.push(`${first ? '' : ','}{"versionId":${JSON.stringify(v.id)},"mime":${JSON.stringify(f.blob.type || v.mime || 'audio/wav')},"data":"`, await blobToB64(f.blob), '"}')
      first = false
    }
    parts.push(']')
    // immagini del Video Lab (moodboard, schede, storyboard)
    parts.push(',"videoImages":[')
    first = true
    for (const img of await db.videoImages.toArray()) {
      parts.push(`${first ? '' : ','}{"id":${JSON.stringify(img.id)},"videoId":${JSON.stringify(img.videoId)},"mime":${JSON.stringify(img.blob.type || 'image/jpeg')},"data":"`, await blobToB64(img.blob), '"}')
      first = false
    }
    parts.push(']')
  }
  parts.push('}')
  return new Blob(parts, { type: 'application/json' })
}

/** Importa un backup (v1, v2 o v3): unisce i dati, sovrascrivendo quelli con lo stesso id. */
export async function importAll(json: string): Promise<BackupStats> {
  let data
  try { data = JSON.parse(json) } catch { throw new Error('Il file non è leggibile: forse è incompleto o non è un backup.') }
  if (data?.app !== 'genos-ai-studio' || !Array.isArray(data.projects)) {
    throw new Error('Il file non è un backup valido di GENOS AI STUDIO.')
  }
  const arr = <T,>(x: unknown) => (Array.isArray(x) ? (x as T[]) : [])
  const stats: BackupStats = { projects: data.projects.length, tracks: 0, versions: 0, audio: 0, texts: 0 }
  await db.transaction('rw', [db.projects, db.videos, db.videoImages, db.tracks, db.versions, db.diagnoses, db.chats, db.aiNotes, db.audioFiles, db.campaigns, db.artkits], async () => {
    await db.campaigns.bulkPut(arr<Campaign>(data.campaigns))
    await db.artkits.bulkPut(arr<ArtKit>(data.artkits))
    await db.projects.bulkPut(data.projects as Project[])
    await db.videos.bulkPut(arr<VideoProject>(data.videos))
    const tracks = arr<Track>(data.tracks); await db.tracks.bulkPut(tracks); stats.tracks = tracks.length
    const versions = arr<TrackVersion>(data.versions).map(versionIn); await db.versions.bulkPut(versions); stats.versions = versions.length
    const diag = arr<Diagnosis>(data.diagnoses), chats = arr<Chat>(data.chats), notes = arr<AiNote>(data.aiNotes)
    await db.diagnoses.bulkPut(diag); await db.chats.bulkPut(chats); await db.aiNotes.bulkPut(notes)
    stats.texts = diag.length + chats.length + notes.length
    for (const a of arr<{ versionId: string; mime: string; data: string }>(data.audioFiles)) {
      await db.audioFiles.put({ versionId: a.versionId, blob: new Blob([fromB64(a.data)], { type: a.mime }) })
      stats.audio++
    }
    for (const im of arr<{ id: string; videoId: string; mime: string; data: string }>(data.videoImages)) {
      await db.videoImages.put({ id: im.id, videoId: im.videoId, blob: new Blob([fromB64(im.data)], { type: im.mime }) })
      stats.audio++
    }
  })
  return stats
}
