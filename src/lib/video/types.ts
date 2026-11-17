/**
 * Video Lab — modello dati.
 * Un "video" vive dentro un progetto e attraversa il workflow:
 * concept → direzione artistica → moodboard → schede → sceneggiatura
 * → storyboard → shot list → prompt → piano di riprese → montaggio → color → export.
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

/* ---------------- V2: storyboard, shot list, prompt ---------------- */

export const SHOT_SIZES = [
  'campo lunghissimo', 'campo lungo', 'totale', 'figura intera', 'piano americano',
  'mezza figura', 'primo piano', 'primissimo piano', 'dettaglio',
] as const
export type ShotSize = (typeof SHOT_SIZES)[number]

/** Un'inquadratura: unità dello storyboard, della shot list e del piano di riprese. */
export interface Shot {
  id: string
  sceneId: string
  size: ShotSize
  angle: string
  movement: string
  /** focale / ottica (riprese) o camera virtuale (3D) */
  lens: string
  light: string
  /** cosa si vede nel fotogramma */
  description: string
  durationSec: number
  /** come si passa all'inquadratura successiva */
  transition: string
  sheets: string[]
  technique: VideoTechnique
  sound: string
  /** prompt (inglese) per generare un fotogramma di riferimento/storyboard */
  prompt: string
  /** indicazioni tecniche per le inquadrature in 3D/codice */
  note3d: string
  /** immagine dello storyboard (schizzo, foto o immagine generata) in videoImages */
  frameImageId?: string
  /** girata / completata (checklist da telefono) */
  done?: boolean
}

/* ---------------- V3: riprese, montaggio, color ---------------- */

export interface ShootDay {
  id: string
  title: string
  location: string
  time: string
  shotIds: string[]
  prep: string
  gear: string[]
  notes: string
}

export interface ShootPlan {
  days: ShootDay[]
  gear: string[]
  props: string[]
  risks: string[]
  updatedAt: number
}

export interface EditPlan {
  approach: string
  sections: { section: string; rhythm: string; cuts: string }[]
  keyMoments: { time: string; what: string }[]
  transitions: string[]
  avoid: string[]
  updatedAt: number
}

export interface ColorPlan {
  overall: string
  software: string
  params: { name: string; value: string; why: string }[]
  perScene: { scene: string; look: string; note: string }[]
  steps: string[]
  render3d: string
  updatedAt: number
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
  /** V2 — inquadrature (storyboard / shot list / prompt) */
  shots?: Shot[]
  /** V3 */
  shootPlan?: ShootPlan
  editPlan?: EditPlan
  colorPlan?: ColorPlan
  /** voci spuntate nella checklist da telefono (attrezzatura, oggetti di scena) */
  checklist?: string[]
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
