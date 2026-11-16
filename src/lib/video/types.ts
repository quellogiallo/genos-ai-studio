/**
 * Video Lab — modello dati.
 * Un "video" vive dentro un progetto e attraversa il workflow:
 * concept → direzione artistica → moodboard → schede → sceneggiatura
 * (V2: storyboard, shot list, prompt · V3: riprese, montaggio, color, export).
 */

export type VideoFormat = 'videoclip' | 'teaser' | 'visualizer' | 'corto' | 'altro'
export type VideoTechnique = 'reale' | '3d'

export const FORMAT_LABEL: Record<VideoFormat, string> = {
  videoclip: 'Videoclip', teaser: 'Teaser', visualizer: 'Visualizer', corto: 'Cortometraggio', altro: 'Altro',
}
export const TECHNIQUE_LABEL: Record<VideoTechnique, string> = {
  reale: 'Riprese reali', '3d': '3D / codice',
}

/** Domanda che l'AI fa quando le mancano informazioni, con la tua risposta. */
export interface OpenQuestion {
  id: string
  question: string
  answer: string
}

/** Passo 1 — analisi critica del concept. */
export interface ConceptAnalysis {
  logline: string
  theme: string
  subtext: string
  tone: string
  visualPromise: string
  strengths: string[]
  weaknesses: string[]
  cliches: string[]
  questions: OpenQuestion[]
  updatedAt: number
}

export interface PaletteColor {
  hex: string
  name: string
  role: string
}

/** Passo 2 — una direzione artistica (proposta o scelta). */
export interface ArtDirection {
  id: string
  name: string
  logline: string
  palette: PaletteColor[]
  look: string
  light: string
  texture: string
  camera: string
  rules: string[]
  avoid: string[]
  why: string
  limits: string
}

export type MoodTag = 'luce' | 'colore' | 'location' | 'costume' | 'texture' | 'inquadratura' | 'altro'
export const MOOD_TAGS: MoodTag[] = ['luce', 'colore', 'location', 'costume', 'texture', 'inquadratura', 'altro']

/** Passo 3 — un elemento della moodboard (immagine caricata o link). */
export interface MoodItem {
  id: string
  kind: 'image' | 'link'
  /** id in videoImages (solo kind=image) */
  imageId?: string
  url?: string
  tag: MoodTag
  note: string
  /** colori dominanti estratti dall'immagine (misurati, non AI) */
  colors?: string[]
  createdAt: number
}

/** Suggerimento dell'AI su cosa cercare per la moodboard. */
export interface MoodSearch {
  id: string
  tag: MoodTag
  what: string
  why: string
}

export type SheetKind = 'personaggio' | 'ambiente' | 'oggetto'
export const SHEET_KINDS: SheetKind[] = ['personaggio', 'ambiente', 'oggetto']

/**
 * Passo 4 — scheda condivisa (personaggio, ambiente o oggetto).
 * È la fonte unica di coerenza: scene e prompt la richiameranno per nome.
 */
export interface Sheet {
  id: string
  kind: SheetKind
  name: string
  role: string
  look: string
  /** costume (personaggi) / arredo e materiali (ambienti) */
  details: string
  colors: string
  /** movimento, attitudine (personaggi) / atmosfera (ambienti) */
  behavior: string
  /** cosa NON deve cambiare mai tra una scena e l'altra */
  continuity: string
  imageId?: string
}

/** Passo 5 — una scena della sceneggiatura. */
export interface Scene {
  id: string
  title: string
  /** INT / EST + luogo */
  setting: string
  time: string
  action: string
  /** nomi delle schede coinvolte */
  sheets: string[]
  /** a quale parte del brano corrisponde */
  music: string
  durationSec: number
  intent: string
}

export interface VideoProject {
  id: string
  projectId: string
  title: string
  format: VideoFormat
  techniques: VideoTechnique[]
  /** durata prevista in secondi (0 = non definita) */
  targetSec: number
  /** brano del Music Lab collegato */
  trackId?: string
  idea: string
  concept?: ConceptAnalysis
  /** proposte ancora sul tavolo */
  proposals: ArtDirection[]
  direction?: ArtDirection
  mood: MoodItem[]
  moodSearch: MoodSearch[]
  sheets: Sheet[]
  scenes: Scene[]
  /** nota di regia sull'arco complessivo */
  arc: string
  createdAt: number
  updatedAt: number
}

export interface VideoImage {
  id: string
  videoId: string
  blob: Blob
}

export const fmtDur = (s: number) => {
  if (!s || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`
}
