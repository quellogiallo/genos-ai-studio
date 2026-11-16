import { FFT } from './fft'
import type { Section } from './types'

/* ======================= TEMPO (stima) ======================= */

/** Inviluppo di onset (spectral flux con compressione logaritmica). */
function onsetEnvelope(x: Float32Array, fs: number) {
  const N = 1024, HOP = 256
  const fft = new FFT(N)
  const re = new Float32Array(N), im = new Float32Array(N)
  const p = new Float32Array(N / 2 + 1)
  let prev = new Float32Array(N / 2 + 1)
  const n = Math.max(0, Math.floor((x.length - N) / HOP))
  const env = new Float32Array(n)
  const kMax = Math.min(N / 2, Math.floor((8000 / fs) * N))
  for (let t = 0; t < n; t++) {
    fft.power(x, t * HOP, p, re, im)
    const cur = new Float32Array(N / 2 + 1)
    let flux = 0
    for (let k = 1; k <= kMax; k++) {
      cur[k] = Math.log1p(100 * Math.sqrt(p[k]))
      const d = cur[k] - prev[k]
      if (d > 0) flux += d
    }
    env[t] = flux
    prev = cur
  }
  return { env, fps: fs / HOP }
}

export function estimateTempo(x: Float32Array, fs: number) {
  if (x.length < fs * 6) return null
  // normalizza il livello: la stima non deve dipendere dal volume del file
  let pk = 0
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a }
  if (pk < 1e-4) return null
  const xn = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) xn[i] = x[i] / pk
  const { env, fps } = onsetEnvelope(xn, fs)
  // rimuove la media locale (~1 s) e tiene solo la parte positiva
  const w = Math.round(fps)
  const o = new Float32Array(env.length)
  let acc = 0
  for (let i = 0; i < env.length; i++) {
    acc += env[i]
    if (i >= w) acc -= env[i - w]
    const mean = acc / Math.min(i + 1, w)
    o[i] = Math.max(0, env[i] - mean)
  }
  // segnale senza attacchi ritmici (es. tono continuo): nessuna stima
  let oMean = 0
  for (let i = 0; i < o.length; i++) oMean += o[i]
  oMean /= o.length || 1
  if (oMean < 1.5) return null
  const minLag = Math.floor((60 / 220) * fps), maxLag = Math.ceil((4 * 60 / 50) * fps)
  const ac = new Float64Array(maxLag + 2)
  for (let lag = 0; lag <= maxLag + 1; lag++) {
    let s = 0
    for (let i = 0; i + lag < o.length; i++) s += o[i] * o[i + lag]
    ac[lag] = s / (o.length - lag)
  }
  if (ac[0] <= 0) return null
  const acAt = (lag: number) => {
    const i = Math.floor(lag), f = lag - i
    return i + 1 < ac.length ? ac[i] * (1 - f) + ac[i + 1] * f : 0
  }
  // punteggio su griglia di BPM (passo 0.1): energia al periodo e ai suoi multipli,
  // pesata con una preferenza percettiva log-gaussiana (riduce gli errori di ottava)
  let bestBpm = 0, bestScore = -Infinity
  for (let bpm = 50; bpm <= 220; bpm += 0.1) {
    const lag = (60 * fps) / bpm
    let sc = 0
    for (let k = 1; k <= 4; k++) if (k * lag < ac.length - 1) sc += acAt(k * lag) / k
    sc *= Math.exp(-0.5 * Math.pow(Math.log2(bpm / 110) / 1.2, 2))
    if (sc > bestScore) { bestScore = sc; bestBpm = bpm }
  }
  if (!bestBpm) return null
  const bpm = bestBpm
  const best = Math.round((60 * fps) / bpm)
  // confidenza: quanto il picco emerge rispetto alla media dell'autocorrelazione
  let mean = 0
  for (let l = minLag; l <= maxLag; l++) mean += ac[l]
  mean /= maxLag - minLag + 1
  const prominence = acAt((60 * fps) / bpm) / (mean || 1)
  const periodicity = ac[best] / ac[0]
  const confidence = Math.max(0, Math.min(1, (prominence - 3) / 10)) * Math.max(0, Math.min(1, periodicity / 0.3))
  const alternatives = [bpm / 2, bpm * 2].filter((v) => v >= 50 && v <= 220).map((v) => Math.round(v * 10) / 10)
  return { bpm: Math.round(bpm * 10) / 10, confidence, alternatives }
}

/* ======================= TONALITÀ (stima) ======================= */

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const NOTES_IT = ['Do', 'Do#', 'Re', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si']
// profili Krumhansl-Kessler
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

function corr(a: number[], b: number[]) {
  const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length
  let n = 0, da = 0, dbb = 0
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; dbb += (b[i] - mb) ** 2 }
  return da && dbb ? n / Math.sqrt(da * dbb) : 0
}

const keyName = (tonic: number, minor: boolean) => `${NOTES_IT[tonic]} ${minor ? 'minore' : 'maggiore'} (${NOTES[tonic]}${minor ? 'm' : ''})`

export function estimateKey(chroma: number[]) {
  const total = chroma.reduce((a, b) => a + b, 0)
  if (!(total > 0)) return null
  const res: { name: string; r: number }[] = []
  for (let t = 0; t < 12; t++) {
    const rot = (p: number[]) => p.map((_, i) => p[(i - t + 12) % 12])
    res.push({ name: keyName(t, false), r: corr(chroma, rot(MAJ)) })
    res.push({ name: keyName(t, true), r: corr(chroma, rot(MIN)) })
  }
  res.sort((a, b) => b.r - a.r)
  const [r1, r2] = [res[0].r, res[1].r]
  const confidence = Math.max(0, Math.min(1, ((r1 - r2) / 0.12) * Math.max(0, r1)))
  return { key: res[0].name, confidence, alternative: res[1].name }
}

/* ======================= SEZIONI (stima) ======================= */

export function estimateSections(
  frameChroma: Float32Array[], frameBands: Float32Array[], frameTime: number,
  duration: number, shortTerm: number[],
): Section[] {
  const per = Math.max(1, Math.round(1 / frameTime)) // ~1 s per finestra
  const W = Math.floor(frameChroma.length / per)
  const stAt = (t: number) => {
    const i = Math.round((t - 1.5) / 0.1)
    return shortTerm[Math.max(0, Math.min(shortTerm.length - 1, i))] ?? -70
  }
  if (W < 20) return [{ start: 0, end: duration, label: 'A', loudness: avg(shortTerm) }]

  // feature per finestra: cromagramma normalizzato + bande in dB
  const D = 12 + frameBands[0].length
  const F: Float64Array[] = []
  for (let w = 0; w < W; w++) {
    const v = new Float64Array(D)
    for (let f = w * per; f < (w + 1) * per; f++) {
      frameChroma[f].forEach((x, i) => (v[i] += x))
      frameBands[f].forEach((x, i) => (v[12 + i] += x))
    }
    const cs = v.slice(0, 12).reduce((a, b) => a + b, 0) || 1
    for (let i = 0; i < 12; i++) v[i] /= cs
    for (let i = 12; i < D; i++) v[i] = 10 * Math.log10(v[i] / per + 1e-12)
    F.push(v)
  }
  // standardizzazione per dimensione
  for (let d = 0; d < D; d++) {
    let m = 0, s = 0
    F.forEach((v) => (m += v[d])); m /= W
    F.forEach((v) => (s += (v[d] - m) ** 2)); s = Math.sqrt(s / W) || 1
    F.forEach((v) => (v[d] = (v[d] - m) / s))
  }
  const cos = (a: Float64Array, b: Float64Array) => {
    let n = 0, x = 0, y = 0
    for (let i = 0; i < a.length; i++) { n += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i] }
    return x && y ? n / Math.sqrt(x * y) : 0
  }
  // novità di Foote con kernel a scacchiera gaussiano
  const L = 8
  const nov = new Float64Array(W)
  for (let c = L; c < W - L; c++) {
    let s = 0
    for (let i = -L; i < L; i++) for (let j = -L; j < L; j++) {
      const g = Math.exp(-((i + 0.5) ** 2 + (j + 0.5) ** 2) / (2 * (L / 2) ** 2))
      const sign = (i < 0) === (j < 0) ? 1 : -1
      s += sign * g * cos(F[c + i], F[c + j])
    }
    nov[c] = Math.max(0, s)
  }
  const mean = avg(Array.from(nov)), sd = Math.sqrt(avg(Array.from(nov, (v) => (v - mean) ** 2)))
  const bounds: number[] = [0]
  for (let c = L; c < W - L; c++) {
    let isMax = true
    for (let k = -6; k <= 6; k++) if (k && nov[c + k] > nov[c]) { isMax = false; break }
    if (isMax && nov[c] > mean + 0.5 * sd && c - bounds[bounds.length - 1] >= 6) bounds.push(c)
  }
  if (W - bounds[bounds.length - 1] < 6 && bounds.length > 1) bounds.pop()
  bounds.push(W)

  // etichette: segmenti simili ricevono la stessa lettera
  const segs = bounds.slice(0, -1).map((b, i) => {
    const e = bounds[i + 1]
    const m = new Float64Array(D)
    for (let w = b; w < e; w++) F[w].forEach((x, d) => (m[d] += x / (e - b)))
    return { b, e, m }
  })
  const protos: { label: string; m: Float64Array }[] = []
  return segs.map((s, i) => {
    let label = ''
    let best = 0.75
    for (const p of protos) { const c = cos(p.m, s.m); if (c > best) { best = c; label = p.label } }
    if (!label) { label = String.fromCharCode(65 + protos.length); protos.push({ label, m: s.m }) }
    const start = s.b * per * frameTime
    const end = i === segs.length - 1 ? duration : s.e * per * frameTime
    const ls: number[] = []
    for (let t = start + 1.5; t <= end - 1.5; t += 0.5) ls.push(stAt(t))
    return { start, end, label, loudness: ls.length ? avg(ls) : stAt((start + end) / 2) }
  })
}

function avg(a: number[]) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0 }
