import { useEffect, useRef } from 'react'
import type { AudioAnalysis, Section } from '../lib/audio/types'

const C = {
  y: '#ffd400', fg: '#f2f2ee', dim: '#9a9a94', mute: '#5e5e5a', line: '#2a2a2a', bg: '#0a0a0a', red: '#ff4d3d',
}
const MONO = '10px "JetBrains Mono", monospace'

/** Canvas nitido su schermi ad alta densità, ridisegnato al ridimensionamento. */
function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef(draw)
  drawRef.current = draw
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const render = () => {
      const w = cv.clientWidth, h = cv.clientHeight
      const dpr = window.devicePixelRatio || 1
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr) }
      const ctx = cv.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      drawRef.current(ctx, w, h)
    }
    render()
    const ro = new ResizeObserver(render)
    ro.observe(cv)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return ref
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function seekHandler(duration: number, onSeek?: (t: number) => void) {
  return (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onSeek) return
    const r = e.currentTarget.getBoundingClientRect()
    onSeek(Math.max(0, Math.min(duration, ((e.clientX - r.left) / r.width) * duration)))
  }
}

function drawSections(ctx: CanvasRenderingContext2D, sections: Section[], duration: number, w: number, h: number) {
  sections.forEach((s, i) => {
    const x0 = (s.start / duration) * w, x1 = (s.end / duration) * w
    if (i % 2) { ctx.fillStyle = 'rgba(255,255,255,0.025)'; ctx.fillRect(x0, 0, x1 - x0, h) }
    if (i > 0) { ctx.strokeStyle = C.mute; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x0 + 0.5, 0); ctx.lineTo(x0 + 0.5, h); ctx.stroke(); ctx.setLineDash([]) }
    ctx.fillStyle = C.y; ctx.font = 'bold 11px "Archivo", sans-serif'
    if (x1 - x0 > 14) ctx.fillText(s.label, x0 + 4, 13)
  })
}

function drawPlayhead(ctx: CanvasRenderingContext2D, t: number | undefined, duration: number, w: number, h: number) {
  if (t === undefined) return
  const x = (t / duration) * w
  ctx.fillStyle = C.fg
  ctx.fillRect(Math.round(x), 0, 1.5, h)
}

/* ------------------- forma d'onda + loudness nel tempo ------------------- */
export function LoudnessTimeline({ a, time, onSeek }: { a: AudioAnalysis; time?: number; onSeek?: (t: number) => void }) {
  const ref = useCanvas((ctx, w, h) => {
    const top = 18, bottom = 16, ph = h - top - bottom
    // forma d'onda
    const { min, max } = a.waveform
    const mid = top + ph / 2
    ctx.fillStyle = '#26261f'
    for (let x = 0; x < w; x++) {
      const i = Math.floor((x / w) * min.length)
      const y0 = mid - max[i] * (ph / 2), y1 = mid - min[i] * (ph / 2)
      ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0))
    }
    drawSections(ctx, a.sections, a.duration, w, h)
    // griglia LUFS
    const lo = -40, hi = 0
    const yOf = (l: number) => top + ((hi - Math.max(lo, Math.min(hi, l))) / (hi - lo)) * ph
    ctx.font = MONO
    for (const l of [-10, -20, -30]) {
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(0, yOf(l) + 0.5); ctx.lineTo(w, yOf(l) + 0.5); ctx.stroke()
      ctx.fillStyle = C.mute; ctx.fillText(`${l}`, w - 24, yOf(l) - 3)
    }
    // linea integrata
    if (Number.isFinite(a.integratedLufs)) {
      ctx.strokeStyle = C.dim; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(0, yOf(a.integratedLufs)); ctx.lineTo(w, yOf(a.integratedLufs)); ctx.stroke(); ctx.setLineDash([])
    }
    // short-term (centrata sulla finestra di 3 s)
    const st = a.timeline.shortTerm
    ctx.strokeStyle = C.y; ctx.lineWidth = 2; ctx.beginPath()
    st.forEach((l, i) => {
      const t = i * a.timeline.step + 1.5
      const x = (t / a.duration) * w, y = yOf(l)
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y)
    })
    ctx.stroke(); ctx.lineWidth = 1
    // asse tempi
    ctx.fillStyle = C.mute
    const stepS = a.duration > 240 ? 60 : a.duration > 60 ? 30 : 10
    for (let t = stepS; t < a.duration; t += stepS) ctx.fillText(fmtTime(t), (t / a.duration) * w - 10, h - 3)
    drawPlayhead(ctx, time, a.duration, w, h)
  }, [a, time])
  return <canvas ref={ref} className="chart" style={{ height: 200 }} onPointerDown={seekHandler(a.duration, onSeek)} />
}

/* ------------------- correlazione stereo nel tempo ------------------- */
export function CorrelationChart({ a, time, onSeek }: { a: AudioAnalysis; time?: number; onSeek?: (t: number) => void }) {
  const ref = useCanvas((ctx, w, h) => {
    const s = a.timeline.correlation
    if (!s) return
    const yOf = (v: number) => ((1 - v) / 2) * (h - 4) + 2
    ctx.strokeStyle = C.line
    for (const v of [0.5, 0, -0.5]) { ctx.beginPath(); ctx.moveTo(0, yOf(v) + 0.5); ctx.lineTo(w, yOf(v) + 0.5); ctx.stroke() }
    ctx.fillStyle = 'rgba(255,77,61,0.08)'; ctx.fillRect(0, yOf(0), w, h - yOf(0))
    for (let x = 0; x < w; x++) {
      const i0 = Math.floor((x / w) * s.length), i1 = Math.max(i0 + 1, Math.floor(((x + 1) / w) * s.length))
      let mn = 1
      for (let i = i0; i < i1 && i < s.length; i++) mn = Math.min(mn, s[i])
      ctx.fillStyle = mn < 0 ? C.red : mn < 0.3 ? '#c9a800' : '#5c5c3a'
      ctx.fillRect(x, yOf(mn), 1, yOf(-1) - yOf(mn))
    }
    ctx.font = MONO; ctx.fillStyle = C.mute
    ctx.fillText('+1', 3, 11); ctx.fillText('0', 3, yOf(0) - 3); ctx.fillText('−1', 3, h - 4)
    drawPlayhead(ctx, time, a.duration, w, h)
  }, [a, time])
  return <canvas ref={ref} className="chart" style={{ height: 90 }} onPointerDown={seekHandler(a.duration, onSeek)} />
}

/* ------------------- spettro medio ------------------- */
export function SpectrumChart({ spectra }: { spectra: { label: string; color: string; freqs: number[]; values: number[]; dashed?: boolean }[] }) {
  const ref = useCanvas((ctx, w, h) => {
    const left = 30, bottom = 16, pw = w - left, ph = h - bottom
    const fLo = 20, fHi = 20000, dLo = -72, dHi = 0
    const xOf = (f: number) => left + (Math.log(f / fLo) / Math.log(fHi / fLo)) * pw
    const yOf = (d: number) => ((dHi - Math.max(dLo, Math.min(dHi, d))) / (dHi - dLo)) * ph
    ctx.font = MONO
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(xOf(f) + 0.5, 0); ctx.lineTo(xOf(f) + 0.5, ph); ctx.stroke()
      ctx.fillStyle = C.mute; ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, xOf(f) - 8, h - 3)
    }
    for (let d = -12; d > dLo; d -= 12) {
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(left, yOf(d) + 0.5); ctx.lineTo(w, yOf(d) + 0.5); ctx.stroke()
      ctx.fillStyle = C.mute; ctx.fillText(`${d}`, 2, yOf(d) + 3)
    }
    spectra.forEach((s) => {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2
      ctx.setLineDash(s.dashed ? [5, 4] : [])
      ctx.beginPath()
      s.freqs.forEach((f, i) => { const x = xOf(f), y = yOf(s.values[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y) })
      ctx.stroke()
    })
    ctx.setLineDash([]); ctx.lineWidth = 1
  }, [spectra])
  return <canvas ref={ref} className="chart" style={{ height: 220 }} />
}

/* ------------------- spettrogramma ------------------- */
const PALETTE = (() => {
  const p = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    // nero → giallo scuro → giallo → bianco
    const r = t < 0.6 ? (t / 0.6) * 255 : 255
    const g = t < 0.35 ? (t / 0.35) * 70 : t < 0.8 ? 70 + ((t - 0.35) / 0.45) * 142 : 212 + ((t - 0.8) / 0.2) * 43
    const b = t < 0.8 ? 0 : ((t - 0.8) / 0.2) * 230
    p[i * 3] = r * Math.min(1, t * 2.2); p[i * 3 + 1] = g; p[i * 3 + 2] = b
  }
  return p
})()

export function Spectrogram({ a, time, onSeek }: { a: AudioAnalysis; time?: number; onSeek?: (t: number) => void }) {
  const imgRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const { cols, rows, data } = a.spectrogram
    const off = document.createElement('canvas')
    off.width = cols; off.height = rows
    const ctx = off.getContext('2d')!
    const img = ctx.createImageData(cols, rows)
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const v = data[c * rows + r], o = ((rows - 1 - r) * cols + c) * 4
      img.data[o] = PALETTE[v * 3]; img.data[o + 1] = PALETTE[v * 3 + 1]; img.data[o + 2] = PALETTE[v * 3 + 2]; img.data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    imgRef.current = off
  }, [a])
  const ref = useCanvas((ctx, w, h) => {
    if (!imgRef.current) return
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(imgRef.current, 0, 0, w, h)
    const { fMin, fMax } = a.spectrogram
    ctx.font = MONO
    for (const f of [100, 1000, 10000]) {
      const y = h - (Math.log(f / fMin) / Math.log(fMax / fMin)) * h
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(2, y - 9, 28, 12)
      ctx.fillStyle = C.fg; ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, 5, y)
    }
    drawPlayhead(ctx, time, a.duration, w, h)
  }, [a, time, imgRef.current])
  return <canvas ref={ref} className="chart" style={{ height: 180 }} onPointerDown={seekHandler(a.duration, onSeek)} />
}
