import { FORMATS, type Artwork, type Identity } from './types'
import { contrast } from './utils'

/**
 * Disegna un artwork su canvas, alle misure reali (export) o ridotte (anteprima):
 * tutte le misure sono proporzionali al lato corto, quindi l'anteprima è identica al file.
 */
export function renderArtwork(ctx: CanvasRenderingContext2D, a: Artwork, W: number, H: number, id: Identity | undefined, img: ImageBitmap | HTMLImageElement | null, opts: { guides?: boolean } = {}) {
  const S = Math.min(W, H)
  const display = id?.fontDisplay ?? 'Archivo'
  const text = id?.fontText ?? 'Inter Tight'
  ctx.save()
  ctx.clearRect(0, 0, W, H)
  if (!a.transparent) { ctx.fillStyle = a.bg; ctx.fillRect(0, 0, W, H) }

  const drawImage = (x: number, y: number, w: number, h: number) => {
    if (!img) return
    const iw = img.width, ih = img.height
    const k = a.imageFit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih)
    const dw = iw * k, dh = ih * k
    ctx.save()
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
    ctx.globalAlpha = a.imageOpacity
    if (a.imageGray) ctx.filter = 'grayscale(1) contrast(1.15)'
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
    ctx.restore()
  }

  /** titolo che si adatta alla larghezza disponibile */
  const title = (x: number, y: number, maxW: number, base: number, align: CanvasTextAlign, baseline: CanvasTextBaseline = 'alphabetic') => {
    const lines = (a.title || ' ').toUpperCase().split('\n')
    let size = base * a.titleScale
    ctx.font = `800 ${size}px "${display}"`
    const widest = () => Math.max(...lines.map((l) => ctx.measureText(l).width))
    while (widest() > maxW && size > 8) { size *= 0.94; ctx.font = `800 ${size}px "${display}"` }
    ctx.fillStyle = a.ink; ctx.textAlign = align; ctx.textBaseline = baseline
    const lh = size * 0.9
    const startY = baseline === 'top' ? y : y - lh * (lines.length - 1)
    lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lh))
    return { size, height: lh * lines.length }
  }
  const small = (s: string, x: number, y: number, size: number, align: CanvasTextAlign, color = a.ink, weight = 500) => {
    if (!s) return
    ctx.font = `${weight} ${size}px "${text}"`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'
    ctx.fillText(s, x, y)
  }

  const m = S * 0.06 // margine
  switch (a.layout) {
    case 'centrato': {
      drawImage(0, 0, W, H)
      const t = title(W / 2, H * 0.5, W - m * 2, S * 0.16, 'center', 'middle')
      small(a.subtitle.toUpperCase(), W / 2, H * 0.5 + t.height / 2 + S * 0.05, S * 0.035, 'center', a.ink, 700)
      small(a.small, W / 2, H - m, S * 0.022, 'center')
      break
    }
    case 'griglia': {
      const cols = 4, rows = Math.round(4 * H / W)
      drawImage(0, 0, W * 0.75, H * (rows - 1) / rows)
      ctx.strokeStyle = a.accent; ctx.lineWidth = Math.max(1, S * 0.003)
      for (let i = 1; i < cols; i++) { ctx.beginPath(); ctx.moveTo((W / cols) * i, 0); ctx.lineTo((W / cols) * i, H); ctx.stroke() }
      for (let j = 1; j < rows; j++) { ctx.beginPath(); ctx.moveTo(0, (H / rows) * j); ctx.lineTo(W, (H / rows) * j); ctx.stroke() }
      title(m * 0.6, H - m * 0.8, W - m * 1.2, S * 0.15, 'left')
      small(a.subtitle.toUpperCase(), W - m * 0.6, m * 1.1, S * 0.03, 'right', a.accent, 700)
      small(a.small, W - m * 0.6, m * 1.1 + S * 0.04, S * 0.02, 'right')
      break
    }
    case 'bordo': {
      const b = S * 0.07
      ctx.fillStyle = a.accent
      if (!a.transparent) ctx.fillRect(0, 0, W, H)
      drawImage(b, b, W - b * 2, H - b * 3.2)
      title(b, H - b * 0.6, W - b * 2, S * 0.12, 'left')
      small(a.subtitle.toUpperCase(), W - b, b * 0.68, S * 0.028, 'right', a.ink, 800)
      small(a.small, b, b * 0.68, S * 0.02, 'left')
      break
    }
    case 'diagonale': {
      drawImage(0, 0, W, H)
      ctx.save()
      ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 9)
      const band = S * 0.22
      ctx.fillStyle = a.accent
      ctx.fillRect(-Math.hypot(W, H) / 2, -band / 2, Math.hypot(W, H), band)
      ctx.restore()
      ctx.save()
      ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 9)
      title(0, 0, W * 0.9, S * 0.14, 'center', 'middle')
      ctx.restore()
      small(a.subtitle.toUpperCase(), m, m * 1.2, S * 0.03, 'left', a.ink, 800)
      small(a.small, W - m, H - m, S * 0.022, 'right')
      break
    }
    case 'tipografico': {
      drawImage(0, 0, W, H)
      const word = (a.title || ' ').toUpperCase().replace(/\n/g, ' ')
      let size = S * 0.2 * a.titleScale
      ctx.font = `800 ${size}px "${display}"`
      const wd = ctx.measureText(word).width
      if (wd > W * 0.96) { size *= (W * 0.96) / wd; ctx.font = `800 ${size}px "${display}"` }
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      const lh = size * 0.88
      const n = Math.max(1, Math.floor((H - m) / lh))
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i === Math.floor(n / 2) ? a.accent : a.ink
        ctx.globalAlpha = i === Math.floor(n / 2) ? 1 : 0.18 + 0.6 * (1 - Math.abs(i - n / 2) / n)
        ctx.fillText(word, W * 0.02, m * 0.5 + i * lh)
      }
      ctx.globalAlpha = 1
      small(a.subtitle.toUpperCase(), W - m * 0.6, H - m * 0.9, S * 0.03, 'right', a.ink, 800)
      small(a.small, m * 0.6, H - m * 0.9, S * 0.02, 'left')
      break
    }
  }

  if (a.grain > 0) {
    const tile = document.createElement('canvas')
    tile.width = tile.height = 256
    const t = tile.getContext('2d')!
    const d = t.createImageData(256, 256)
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255 }
    t.putImageData(d, 0, 0)
    ctx.save()
    ctx.globalAlpha = a.grain * 0.35
    ctx.globalCompositeOperation = 'overlay'
    const scale = Math.max(1, S / 1500)
    ctx.scale(scale, scale)
    ctx.fillStyle = ctx.createPattern(tile, 'repeat')!
    ctx.fillRect(0, 0, W / scale, H / scale)
    ctx.restore()
  }

  if (opts.guides) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,60,60,0.9)'; ctx.setLineDash([S * 0.015, S * 0.01]); ctx.lineWidth = Math.max(1, S * 0.003)
    const f = FORMATS[a.format]
    if (a.format === 'story') { const k = (250 / f.h) * H; ctx.strokeRect(0, k, W, H - 2 * k) }
    else if (a.format === 'poster') { const k = (35 / f.w) * W; ctx.strokeRect(k, k, W - 2 * k, H - 2 * k) }
    else if (a.format === 'post') { const k = (W - H * 0.8) / 2; if (k > 0) ctx.strokeRect(k, 0, W - 2 * k, H) }
    ctx.restore()
  }
  ctx.restore()
}

/** Controlli automatici sull'artwork (misurati, non opinioni). */
export function checkArtwork(a: Artwork, img: { width: number; height: number } | null) {
  const f = FORMATS[a.format]
  const out: { level: 'ok' | 'warn' | 'alert'; text: string }[] = []
  const c = contrast(a.ink, a.layout === 'bordo' ? a.accent : a.bg)
  if (!a.transparent) out.push(c >= 4.5 ? { level: 'ok', text: `Contrasto testo/sfondo ${c.toFixed(1)}: leggibile.` } : c >= 3 ? { level: 'warn', text: `Contrasto ${c.toFixed(1)}: va bene solo per titoli grandi.` } : { level: 'alert', text: `Contrasto ${c.toFixed(1)}: il testo rischia di non leggersi (sopra un'immagine dipende dalla zona: controlla).` })
  if (img) {
    const need = Math.max(f.w, f.h) * (a.imageFit === 'cover' ? 1 : 0.8)
    const have = Math.max(img.width, img.height)
    if (have < need * 0.66) out.push({ level: 'alert', text: `Immagine piccola (${img.width}×${img.height}) per ${f.w}×${f.h}: in stampa o negli store si vedrà sgranata.` })
    else if (have < need) out.push({ level: 'warn', text: `Immagine leggermente sotto risoluzione (${img.width}×${img.height}).` })
    else out.push({ level: 'ok', text: `Risoluzione immagine sufficiente (${img.width}×${img.height}).` })
  }
  if (a.format === 'cover') {
    if (/https?:|www\.|\.com|@\w/i.test(`${a.title} ${a.subtitle} ${a.small}`)) out.push({ level: 'alert', text: 'Le copertine non devono contenere link, siti o nomi utente social: gli store le rifiutano.' })
    if (a.small.length > 0 && a.small.length < 4) out.push({ level: 'warn', text: 'Il testo piccolo in copertina diventa illeggibile nelle miniature: valuta di toglierlo.' })
    out.push({ level: 'ok', text: 'Formato 3000×3000 come richiesto dai distributori.' })
  }
  if (a.format === 'story') out.push({ level: 'warn', text: 'Tieni titolo e testi dentro il riquadro tratteggiato: fuori li coprono nome e pulsanti dell\'app.' })
  if (a.format === 'poster') out.push({ level: 'warn', text: 'Per la stampa: chiedi alla tipografia se vuole abbondanza (bleed); il riquadro tratteggiato è il margine di sicurezza.' })
  if (a.format === 'merch' && !a.transparent) out.push({ level: 'warn', text: 'Per stampare su capi colorati di solito serve lo sfondo trasparente.' })
  return out
}
