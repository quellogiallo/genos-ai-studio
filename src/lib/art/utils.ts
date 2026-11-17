import { db, uid } from '../db'
import { dominantColors } from '../video/palette'
import { FONTS } from './types'

/* ---------------- font ---------------- */

let fontsInjected = false
/** Carica (una volta) tutti i font dell'Art Direction Lab da Google Fonts. */
export function loadArtFonts() {
  if (fontsInjected || typeof document === 'undefined') return
  fontsInjected = true
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${FONTS.map((f) => `family=${f.css}`).join('&')}&display=swap`
  document.head.appendChild(link)
}

/** Aspetta che i font servano davvero (necessario prima di disegnare su canvas). */
export async function ensureFonts(names: string[]) {
  loadArtFonts()
  await Promise.all(names.flatMap((n) => [`400 40px "${n}"`, `800 40px "${n}"`].map((f) => document.fonts.load(f).catch(() => undefined))))
}

/* ---------------- colore ---------------- */

export function hexToRgb(h: string): [number, number, number] {
  const m = h.replace('#', '')
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)]
}

const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }

function rgbToLab([r, g, b]: [number, number, number]): [number, number, number] {
  const R = lin(r), G = lin(g), B = lin(b)
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const y = (R * 0.2126 + G * 0.7152 + B * 0.0722)
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/** Distanza percettiva tra due colori (CIE76): ~2 appena visibile, >25 molto diversi. */
export function deltaE(a: string, b: string) {
  const [l1, a1, b1] = rgbToLab(hexToRgb(a)), [l2, a2, b2] = rgbToLab(hexToRgb(b))
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/** Vicinanza (0–1) dei colori di un'immagine alla palette: media della distanza dal colore di palette più vicino. */
export function paletteFit(colors: string[], palette: string[]) {
  if (!colors.length || !palette.length) return 0
  const avg = colors.reduce((s, c) => s + Math.min(...palette.map((p) => deltaE(c, p))), 0) / colors.length
  return Math.max(0, Math.min(1, 1 - avg / 50))
}

/** Contrasto WCAG tra due colori (1–21). Testo normale leggibile da 4.5, grande da 3. */
export function contrast(a: string, b: string) {
  const L = (h: string) => { const [r, g, bb] = hexToRgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bb) }
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/* ---------------- immagini ---------------- */

/** Le immagini dell'Art Direction Lab stanno nella tabella locale delle immagini, con chiave "art-<kit>". */
export const artKey = (kitId: string) => `art-${kitId}`

export async function storeArtImage(kitId: string, file: File, maxSide = 1600): Promise<{ imageId: string; colors: string[] }> {
  if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" non è un'immagine.`)
  if (file.size > 40 * 1024 * 1024) throw new Error(`"${file.name}" è troppo grande (massimo 40 MB).`)
  let blob: Blob, colors: string[]
  try {
    blob = await shrink(file, maxSide)
    colors = await dominantColors(blob)
  } catch {
    throw new Error(`Non riesco a leggere "${file.name}". Prova con un JPG o PNG.`)
  }
  const imageId = uid()
  await db.videoImages.add({ id: imageId, videoId: artKey(kitId), blob })
  return { imageId, colors }
}

/** Riduce solo se serve; i PNG restano PNG (trasparenza per loghi e merch). */
async function shrink(file: Blob, maxSide: number): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const png = file.type === 'image/png'
  if (scale === 1 && (png || file.size < 3_000_000)) { bmp.close(); return file }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) { bmp.close(); return file }
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), png ? 'image/png' : 'image/jpeg', 0.9))
}
