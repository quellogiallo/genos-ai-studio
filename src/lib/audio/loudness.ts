/**
 * Loudness secondo ITU-R BS.1770-4 / EBU R128 / EBU Tech 3342 (LRA).
 * Coefficienti K-weighting calcolati per qualsiasi sample rate (metodo libebur128).
 */

const SEG = 0.1 // segmenti da 100 ms: base per blocchi momentary (4) e short-term (30)

function kWeightCoeffs(fs: number) {
  // Stadio 1: high-shelf (effetto testa)
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196
  let K = Math.tan((Math.PI * f0) / fs)
  const Vh = Math.pow(10, G / 20)
  const Vb = Math.pow(Vh, 0.4996667741545416)
  let a0 = 1 + K / Q + K * K
  const b1 = [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0]
  const a1 = [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0]
  // Stadio 2: high-pass (RLB)
  f0 = 38.13547087602444; Q = 0.5003270373238773
  K = Math.tan((Math.PI * f0) / fs)
  a0 = 1 + K / Q + K * K
  const b2 = [1, -2, 1]
  const a2 = [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0]
  return { b1, a1, b2, a2 }
}

/** Applica il K-weighting e restituisce la media quadratica per segmento da 100 ms. */
function kWeightedSegments(x: Float32Array, fs: number): Float64Array {
  const { b1, a1, b2, a2 } = kWeightCoeffs(fs)
  const segLen = Math.round(fs * SEG)
  const nSeg = Math.floor(x.length / segLen)
  const out = new Float64Array(nSeg)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0 // stadio 1
  let z1 = 0, z2 = 0, w1 = 0, w2 = 0 // stadio 2
  for (let s = 0; s < nSeg; s++) {
    let acc = 0
    const start = s * segLen
    for (let i = start; i < start + segLen; i++) {
      const xi = x[i]
      const y = b1[0] * xi + b1[1] * x1 + b1[2] * x2 - a1[1] * y1 - a1[2] * y2
      x2 = x1; x1 = xi; y2 = y1; y1 = y
      const w = b2[0] * y + b2[1] * z1 + b2[2] * z2 - a2[1] * w1 - a2[2] * w2
      z2 = z1; z1 = y; w2 = w1; w1 = w
      acc += w * w
    }
    out[s] = acc / segLen
  }
  return out
}

const toLufs = (ms: number) => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity)

/** Somma dei segmenti in finestre scorrevoli di `len` segmenti (hop = 1 segmento). */
function windows(seg: Float64Array, len: number): Float64Array {
  const n = Math.max(0, seg.length - len + 1)
  const out = new Float64Array(n)
  let acc = 0
  for (let i = 0; i < seg.length; i++) {
    acc += seg[i]
    if (i >= len) acc -= seg[i - len]
    if (i >= len - 1) out[i - len + 1] = acc / len
  }
  return out
}

function gatedIntegrated(blocks: Float64Array): number {
  const abs = blocks.filter((b) => toLufs(b) > -70)
  if (!abs.length) return -Infinity
  const rel = toLufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10
  const gated = abs.filter((b) => toLufs(b) > rel)
  if (!gated.length) return -Infinity
  return toLufs(gated.reduce((a, b) => a + b, 0) / gated.length)
}

function loudnessRange(st: Float64Array): number {
  const abs = Array.from(st).filter((b) => toLufs(b) > -70)
  if (abs.length < 2) return 0
  const rel = toLufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 20
  const vals = abs.map(toLufs).filter((l) => l > rel).sort((a, b) => a - b)
  if (vals.length < 2) return 0
  const pct = (p: number) => vals[Math.min(vals.length - 1, Math.max(0, Math.round(p * (vals.length - 1))))]
  return pct(0.95) - pct(0.1)
}

/** True peak con sovracampionamento 4x (FIR sinc finestrato, 12 tap per fase). */
function truePeak(x: Float32Array, fs: number): number {
  let peak = 0
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a }
  if (fs >= 176400) return peak
  const TAPS = 12, PH = 4
  const h: Float32Array[] = []
  for (let p = 1; p < PH; p++) {
    const ph = new Float32Array(TAPS)
    let sum = 0
    for (let k = 0; k < TAPS; k++) {
      const t = k - TAPS / 2 + 1 - p / PH // distanza dal punto interpolato
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)
      const win = 0.5 + 0.5 * Math.cos((Math.PI * t) / (TAPS / 2 + 1))
      ph[k] = sinc * win; sum += ph[k]
    }
    for (let k = 0; k < TAPS; k++) ph[k] /= sum
    h.push(ph)
  }
  const n = x.length
  for (let i = TAPS / 2 - 1; i < n - TAPS / 2; i++) {
    // controllo rapido: picchi intersample significativi solo vicino a campioni alti
    if (Math.abs(x[i]) < peak * 0.5 && Math.abs(x[i + 1]) < peak * 0.5) continue
    const base = i - TAPS / 2 + 1
    for (let p = 0; p < PH - 1; p++) {
      const c = h[p]
      let y = 0
      for (let k = 0; k < TAPS; k++) y += x[base + k] * c[k]
      const a = Math.abs(y)
      if (a > peak) peak = a
    }
  }
  return peak
}

export interface LoudnessResult {
  integratedLufs: number
  lra: number
  maxMomentary: number
  maxShortTerm: number
  truePeakDb: number
  samplePeakDb: number
  rmsDb: number
  crestDb: number
  plr: number
  clippedSamples: number
  clipEvents: number
  dcOffset: number
  monoIntegratedLufs: number | null
  /** serie per grafici, passo 0.1 s, allineate al centro della finestra */
  momentary: number[]
  shortTerm: number[]
}

const db = (a: number) => (a > 0 ? 20 * Math.log10(a) : -Infinity)

export function computeLoudness(chs: Float32Array[], fs: number, progress: (p: number) => void): LoudnessResult {
  const nCh = chs.length
  const segs = chs.map((c, i) => { const s = kWeightedSegments(c, fs); progress((i + 1) / (nCh + 2) * 0.5); return s })
  const nSeg = segs[0].length
  const sum = new Float64Array(nSeg)
  for (const s of segs) for (let i = 0; i < nSeg; i++) sum[i] += s[i]

  const mom = windows(sum, 4)
  const st = windows(sum, 30)
  const integratedLufs = gatedIntegrated(mom)
  const lra = loudnessRange(st)

  // Mono-fold: (L+R)/2 su entrambi i canali (il K-weighting è lineare → si può calcolare dai segnali filtrati)
  let monoIntegratedLufs: number | null = null
  if (nCh === 2) {
    const fsM = kWeightedSegments(mixMono(chs[0], chs[1]), fs)
    const monoSum = fsM.map((v) => v * 2)
    monoIntegratedLufs = gatedIntegrated(windows(monoSum, 4))
  }
  progress(0.6)

  // Picchi, RMS, clipping, DC
  let samplePeak = 0, sq = 0, clippedSamples = 0, clipEvents = 0, dcMax = 0
  for (const c of chs) {
    let run = 0, dc = 0
    for (let i = 0; i < c.length; i++) {
      const v = c[i], a = Math.abs(v)
      dc += v
      sq += v * v
      if (a > samplePeak) samplePeak = a
      if (a >= 0.999) run++
      else { if (run >= 3) { clipEvents++; clippedSamples += run } run = 0 }
    }
    if (run >= 3) { clipEvents++; clippedSamples += run }
    dcMax = Math.max(dcMax, Math.abs(dc / c.length))
  }
  const rms = Math.sqrt(sq / (chs.length * chs[0].length))
  progress(0.7)
  let tp = 0
  chs.forEach((c, i) => { tp = Math.max(tp, truePeak(c, fs)); progress(0.7 + ((i + 1) / nCh) * 0.3) })

  const fin = (v: number) => (Number.isFinite(v) ? v : -120)
  return {
    integratedLufs,
    lra,
    maxMomentary: mom.length ? Math.max(...Array.from(mom, toLufs)) : -Infinity,
    maxShortTerm: st.length ? Math.max(...Array.from(st, toLufs)) : -Infinity,
    truePeakDb: db(tp),
    samplePeakDb: db(samplePeak),
    rmsDb: db(rms),
    crestDb: db(samplePeak) - db(rms),
    plr: db(tp) - integratedLufs,
    clippedSamples,
    clipEvents,
    dcOffset: dcMax,
    monoIntegratedLufs,
    momentary: Array.from(mom, (v) => fin(toLufs(v))),
    shortTerm: Array.from(st, (v) => fin(toLufs(v))),
  }
}

export function mixMono(l: Float32Array, r: Float32Array): Float32Array {
  const m = new Float32Array(l.length)
  for (let i = 0; i < l.length; i++) m[i] = (l[i] + r[i]) * 0.5
  return m
}
