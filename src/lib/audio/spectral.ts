import { FFT } from './fft'
import type { BandInfo } from './types'

export const BANDS: Omit<BandInfo, 'levelDb' | 'widthDb'>[] = [
  { id: 'sub', label: 'Sub', lo: 20, hi: 60 },
  { id: 'bass', label: 'Bassi', lo: 60, hi: 250 },
  { id: 'lowmid', label: 'Medio-bassi', lo: 250, hi: 500 },
  { id: 'mid', label: 'Medi', lo: 500, hi: 2000 },
  { id: 'highmid', label: 'Medio-alti', lo: 2000, hi: 6000 },
  { id: 'presence', label: 'Presenza', lo: 6000, hi: 12000 },
  { id: 'air', label: 'Aria', lo: 12000, hi: 20000 },
]

const N = 8192
const HOP = 4096
const SG_ROWS = 96
const SG_FMIN = 30
const SG_FMAX = 20000
const MAX_COLS = 800

export interface SpectralResult {
  bands: BandInfo[]
  tiltDbPerOct: number
  spectrum: { freqs: number[]; mid: number[]; side: number[] | null }
  spectrogram: { cols: number; rows: number; data: Uint8Array; fMin: number; fMax: number }
  /** cromagramma complessivo (12 classi, C=0) */
  chroma: number[]
  /** feature per frame, per le sezioni */
  frameTime: number
  frameChroma: Float32Array[]
  frameBands: Float32Array[]
}

export function computeSpectral(mid: Float32Array, side: Float32Array | null, fs: number, progress: (p: number) => void): SpectralResult {
  const fft = new FFT(N)
  const re = new Float32Array(N), im = new Float32Array(N)
  const pM = new Float32Array(N / 2 + 1), pS = new Float32Array(N / 2 + 1)
  const accM = new Float64Array(N / 2 + 1), accS = new Float64Array(N / 2 + 1)
  const binHz = fs / N
  const nFrames = Math.max(1, Math.floor((mid.length - N) / HOP) + 1)

  // mappa bin → riga dello spettrogramma (scala logaritmica)
  const rowOf = new Int16Array(N / 2 + 1).fill(-1)
  const lmin = Math.log(SG_FMIN), lmax = Math.log(SG_FMAX)
  for (let k = 1; k <= N / 2; k++) {
    const f = k * binHz
    if (f >= SG_FMIN && f < SG_FMAX) rowOf[k] = Math.floor(((Math.log(f) - lmin) / (lmax - lmin)) * SG_ROWS)
  }
  // mappa bin → classe di altezza (65 Hz – 2.1 kHz)
  const pcOf = new Int8Array(N / 2 + 1).fill(-1)
  for (let k = 1; k <= N / 2; k++) {
    const f = k * binHz
    if (f >= 65 && f <= 2100) pcOf[k] = ((Math.round(12 * Math.log2(f / 440)) + 9) % 12 + 12) % 12
  }
  const bandOf = new Int8Array(N / 2 + 1).fill(-1)
  for (let k = 1; k <= N / 2; k++) {
    const f = k * binHz
    BANDS.forEach((b, i) => { if (f >= b.lo && f < b.hi) bandOf[k] = i })
  }

  const frameRows: Float32Array[] = []
  const frameChroma: Float32Array[] = []
  const frameBands: Float32Array[] = []

  for (let fr = 0; fr < nFrames; fr++) {
    const off = fr * HOP
    fft.power(mid, off, pM, re, im)
    if (side) fft.power(side, off, pS, re, im)
    const rows = new Float32Array(SG_ROWS)
    const ch = new Float32Array(12)
    const bd = new Float32Array(BANDS.length)
    for (let k = 1; k <= N / 2; k++) {
      const m = pM[k], s = side ? pS[k] : 0
      accM[k] += m; accS[k] += s
      const r = rowOf[k]
      if (r >= 0) rows[r] += m + s
      const pc = pcOf[k]
      if (pc >= 0) ch[pc] += Math.sqrt(m)
      const b = bandOf[k]
      if (b >= 0) bd[b] += m + s
    }
    frameRows.push(rows); frameChroma.push(ch); frameBands.push(bd)
    if (fr % 64 === 0) progress(fr / nFrames)
  }

  // --- spettro medio smussato (1/12 ottava) su 120 punti logaritmici ---
  const freqs: number[] = [], midDb: number[] = [], sideDb: number[] = []
  const P = 120, f0 = 20, f1 = Math.min(20000, fs / 2)
  for (let i = 0; i < P; i++) {
    const fc = f0 * Math.pow(f1 / f0, i / (P - 1))
    const lo = fc / Math.pow(2, 1 / 24), hi = fc * Math.pow(2, 1 / 24)
    let kLo = Math.max(1, Math.floor(lo / binHz)), kHi = Math.min(N / 2, Math.ceil(hi / binHz))
    if (kHi < kLo) kHi = kLo
    let sm = 0, ss = 0
    for (let k = kLo; k <= kHi; k++) { sm += accM[k]; ss += accS[k] }
    const cnt = kHi - kLo + 1
    freqs.push(fc)
    midDb.push(10 * Math.log10(sm / cnt / nFrames + 1e-20))
    sideDb.push(10 * Math.log10(ss / cnt / nFrames + 1e-20))
  }
  const ref = Math.max(...midDb, ...(side ? sideDb : []))
  const midN = midDb.map((v) => Math.max(-120, v - ref))
  const sideN = side ? sideDb.map((v) => Math.max(-120, v - ref)) : null

  // --- pendenza spettrale (regressione lineare dB vs ottave, 100 Hz – 10 kHz) ---
  const xs: number[] = [], ys: number[] = []
  freqs.forEach((f, i) => { if (f >= 100 && f <= 10000) { xs.push(Math.log2(f)); ys.push(midDb[i]) } })
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length
  let num = 0, den = 0
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2 })
  const tiltDbPerOct = den ? num / den : 0

  // --- bande ---
  let total = 0
  const bM = new Float64Array(BANDS.length), bS = new Float64Array(BANDS.length)
  for (let k = 1; k <= N / 2; k++) {
    total += accM[k] + accS[k]
    const b = bandOf[k]
    if (b >= 0) { bM[b] += accM[k]; bS[b] += accS[k] }
  }
  const bands: BandInfo[] = BANDS.map((b, i) => ({
    ...b,
    levelDb: 10 * Math.log10((bM[i] + bS[i]) / (total || 1) + 1e-20),
    widthDb: side && bM[i] + bS[i] > 0 ? Math.max(-60, Math.min(60, 10 * Math.log10((bS[i] + 1e-20) / (bM[i] + 1e-20)))) : null,
  }))

  // --- spettrogramma ---
  const cols = Math.min(MAX_COLS, frameRows.length)
  const data = new Uint8Array(cols * SG_ROWS)
  const rowBins = new Float32Array(SG_ROWS)
  for (let k = 1; k <= N / 2; k++) if (rowOf[k] >= 0) rowBins[rowOf[k]]++
  let sgMax = -Infinity
  const sgDb = new Float32Array(cols * SG_ROWS)
  for (let c = 0; c < cols; c++) {
    const a = Math.floor((c * frameRows.length) / cols), b = Math.max(a + 1, Math.floor(((c + 1) * frameRows.length) / cols))
    for (let r = 0; r < SG_ROWS; r++) {
      let v = 0
      for (let f = a; f < b; f++) v += frameRows[f][r]
      v /= (b - a) * Math.max(1, rowBins[r])
      const d = 10 * Math.log10(v + 1e-20)
      sgDb[c * SG_ROWS + r] = d
      if (d > sgMax) sgMax = d
    }
  }
  for (let i = 0; i < sgDb.length; i++) data[i] = Math.max(0, Math.min(255, Math.round(((sgDb[i] - sgMax + 90) / 90) * 255)))

  const chroma = new Array(12).fill(0)
  frameChroma.forEach((c) => c.forEach((v, i) => (chroma[i] += v)))

  progress(1)
  return {
    bands, tiltDbPerOct,
    spectrum: { freqs, mid: midN, side: sideN },
    spectrogram: { cols, rows: SG_ROWS, data, fMin: SG_FMIN, fMax: SG_FMAX },
    chroma,
    frameTime: HOP / fs,
    frameChroma, frameBands,
  }
}
