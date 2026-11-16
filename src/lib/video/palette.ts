/**
 * Colori dominanti di un'immagine, MISURATI nel browser (nessuna AI).
 * Riduce l'immagine, raggruppa i pixel in cubetti di colore e
 * restituisce i gruppi più popolati e abbastanza diversi tra loro.
 */
export async function dominantColors(blob: Blob, count = 5): Promise<string[]> {
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, 96 / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const { data } = ctx.getImageData(0, 0, w, h)

  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4)
    const b = buckets.get(key)
    if (b) { b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2] }
    else buckets.set(key, { n: 1, r: data[i], g: data[i + 1], b: data[i + 2] })
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n).map((b) => [b.r / b.n, b.g / b.n, b.b / b.n])
  const picked: number[][] = []
  for (const c of sorted) {
    if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 48)) picked.push(c)
    if (picked.length === count) break
  }
  return picked.map((c) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`)
}

/** Riduce le immagini grandi prima di salvarle, per non riempire la memoria del browser. */
export async function shrinkImage(file: Blob, maxSide = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  if (scale === 1 && file.size < 1_500_000) { bmp.close(); return file }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) { bmp.close(); return file }
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.86))
}

/** Testo nero o bianco leggibile sopra un colore. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return l > 0.55 ? '#000' : '#fff'
}
