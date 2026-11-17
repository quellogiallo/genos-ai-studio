/**
 * Art Direction Lab: un KIT di identità per progetto (EP, singolo, era artistica).
 * A1 identità visiva e sonora → A2 moodboard → A3 concept di artwork → A4 compositore.
 * L'identità scelta entra nel contesto AI di tutti gli altri moduli.
 */

/** Font realmente caricati dall'app (Google Fonts): l'AI può scegliere solo tra questi. */
export const FONTS = [
  { name: 'Archivo', kind: 'grotesk espanso', css: 'Archivo:wdth,wght@62..125,400..900' },
  { name: 'Space Grotesk', kind: 'grotesk tecnico', css: 'Space+Grotesk:wght@400..700' },
  { name: 'Inter Tight', kind: 'grotesk neutro', css: 'Inter+Tight:wght@400..900' },
  { name: 'Syne', kind: 'display sperimentale', css: 'Syne:wght@400..800' },
  { name: 'Unbounded', kind: 'display geometrico', css: 'Unbounded:wght@400..900' },
  { name: 'Bricolage Grotesque', kind: 'grotesk irregolare', css: 'Bricolage+Grotesque:opsz,wght@12..96,400..800' },
  { name: 'Big Shoulders Display', kind: 'condensato industriale', css: 'Big+Shoulders+Display:wght@400..900' },
  { name: 'Anton', kind: 'condensato pesante', css: 'Anton' },
  { name: 'Monoton', kind: 'display a linee', css: 'Monoton' },
  { name: 'Rubik Glitch', kind: 'display glitch', css: 'Rubik+Glitch' },
  { name: 'Major Mono Display', kind: 'mono display', css: 'Major+Mono+Display' },
  { name: 'JetBrains Mono', kind: 'monospazio', css: 'JetBrains+Mono:wght@400..800' },
  { name: 'Space Mono', kind: 'monospazio retrò', css: 'Space+Mono:wght@400;700' },
  { name: 'IBM Plex Mono', kind: 'monospazio tecnico', css: 'IBM+Plex+Mono:wght@400;700' },
  { name: 'Instrument Serif', kind: 'serif editoriale', css: 'Instrument+Serif' },
  { name: 'Fraunces', kind: 'serif morbido', css: 'Fraunces:opsz,wght@9..144,300..900' },
  { name: 'Playfair Display', kind: 'serif alto contrasto', css: 'Playfair+Display:wght@400..900' },
  { name: 'Cormorant', kind: 'serif classico sottile', css: 'Cormorant:wght@300..700' },
] as const
export type FontName = (typeof FONTS)[number]['name']

export interface Swatch { hex: string; name: string; role: string }

export interface SonicIdentity {
  signature: string[]   // suoni firma
  mixRules: string[]    // regole di mix
  arrangement: string[] // regole di arrangiamento
  avoid: string[]
}

export interface Identity {
  name: string
  concept: string
  keywords: string[]
  palette: Swatch[]
  fontDisplay: FontName
  fontText: FontName
  typeRules: string[]
  logo: string          // indicazioni per logo / wordmark
  imagery: string       // stile di foto e render 3D
  layout: string        // griglie, composizione
  rules: string[]
  avoid: string[]
  sonic: SonicIdentity
  why: string
  limits: string
}

export interface MoodItem {
  id: string
  imageId: string
  note: string
  colors: string[]   // dominanti misurati
  fit?: number       // 0–1: vicinanza alla palette (misurata)
}

export type ArtFormat = 'cover' | 'post' | 'story' | 'poster' | 'merch'

export const FORMATS: Record<ArtFormat, { label: string; w: number; h: number; note: string }> = {
  cover: { label: 'Copertina 3000×3000', w: 3000, h: 3000, note: 'Distributori e store: quadrata, almeno 3000 px, niente link, prezzi, loghi social o testo sfocato.' },
  post: { label: 'Post 1080×1350 (4:5)', w: 1080, h: 1350, note: 'Instagram feed: il 4:5 occupa più schermo del quadrato.' },
  story: { label: 'Storia / Reel 1080×1920', w: 1080, h: 1920, note: 'Lascia libere le fasce in alto e in basso (circa 250 px): lì l\'app copre con nome e pulsanti.' },
  poster: { label: 'Locandina A3 (3508×4961)', w: 3508, h: 4961, note: 'A3 a 300 dpi per la stampa. Margine di sicurezza di 3 mm (circa 35 px) su ogni lato.' },
  merch: { label: 'Stampa merch 4500×5400', w: 4500, h: 5400, note: 'Formato tipico per stampa su t-shirt: sfondo trasparente se esporti solo grafica.' },
}

export interface ArtConcept {
  id: string
  format: ArtFormat
  title: string
  idea: string
  composition: string
  colorUse: string
  typography: string
  imageSource: string   // come ottenere l'immagine: foto, render 3D, solo grafica
  shotOr3d: string      // indicazioni di scatto o di render
  layoutHint: ArtLayout
  why: string
  limits: string
  createdAt: number
}

export type ArtLayout = 'centrato' | 'griglia' | 'bordo' | 'diagonale' | 'tipografico'

export interface Artwork {
  id: string
  format: ArtFormat
  name: string
  layout: ArtLayout
  bg: string            // hex
  ink: string           // hex testo
  accent: string        // hex
  imageId?: string
  imageFit: 'cover' | 'contain'
  imageOpacity: number  // 0–1
  imageGray: boolean
  title: string
  subtitle: string
  small: string         // testo piccolo (data, crediti)
  titleScale: number    // 0.5–2
  grain: number         // 0–1
  transparent: boolean  // per merch
  conceptId?: string
  updatedAt: number
}

export interface ArtKit {
  id: string
  projectId: string
  /** direzioni proposte (A1), una diventa l'identità */
  proposals: Identity[]
  identity?: Identity
  discarded: string[]   // nomi delle direzioni scartate
  mood: MoodItem[]
  concepts: ArtConcept[]
  artworks: Artwork[]
  createdAt: number
  updatedAt: number
}
