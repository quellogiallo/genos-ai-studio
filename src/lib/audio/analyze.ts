import { computeLoudness } from './loudness'
import { computeSpectral } from './spectral'
import { estimateKey, estimateSections, estimateTempo } from './estimates'
import type { AnalysisProgress, AudioAnalysis } from './types'

export interface AnalyzeInput {
  channels: Float32Array[]
  sampleRate: number
  fileSampleRate?: number
  fileBitDepth?: number
}

const WAVE_BUCKETS = 1500
/** limita i dB a ±60 (evita infiniti nei casi estremi: mono perfetto o fase invertita) */
const clampDb = (v: number) => (Number.isFinite(v) ? Math.max(-60, Math.min(60, v)) : v > 0 ? 60 : -60)

export function analyzeAudio(input: AnalyzeInput, onProgress: (p: AnalysisProgress) => void): AudioAnalysis {
  const fs = input.sampleRate
  // al massimo 2 canali (stereo); i multicanale vengono ridotti ai primi due
  const chs = input.channels.slice(0, 2)
  const len = chs[0].length
  const duration = len / fs
  const stereo = chs.length === 2
  const step = (stage: string, a: number, b: number) => (p: number) => onProgress({ stage, pct: a + (b - a) * p })

  // 1. Loudness
  const L = computeLoudness(chs, fs, step('Loudness e picchi (EBU R128)', 0, 0.35))

  // 2. Mid / Side
  const mid = new Float32Array(len)
  const side = stereo ? new Float32Array(len) : null
  if (stereo) for (let i = 0; i < len; i++) { mid[i] = (chs[0][i] + chs[1][i]) * 0.5; side![i] = (chs[0][i] - chs[1][i]) * 0.5 }
  else mid.set(chs[0])

  // 3. Stereo
  let stereoRes: AudioAnalysis['stereo'] = null
  let corrSeries: number[] | null = null
  if (stereo) {
    onProgress({ stage: 'Immagine stereo', pct: 0.36 })
    const [l, r] = chs
    const seg = Math.round(fs * 0.1)
    let sLL = 0, sRR = 0, sLR = 0, sM = 0, sS = 0, neg = 0, counted = 0
    corrSeries = []
    for (let s = 0; s + seg <= len; s += seg) {
      let ll = 0, rr = 0, lr = 0
      for (let i = s; i < s + seg; i++) { ll += l[i] * l[i]; rr += r[i] * r[i]; lr += l[i] * r[i]; sM += mid[i] * mid[i]; sS += side![i] * side![i] }
      sLL += ll; sRR += rr; sLR += lr
      const loud = ll + rr > seg * 2e-7 // ignora i silenzi (sotto ~ -70 dBFS)
      const c = loud ? lr / Math.sqrt(ll * rr || 1) : NaN
      corrSeries.push(Number.isFinite(c) ? c : 1)
      if (loud) { counted++; if (c < 0) neg++ }
    }
    stereoRes = {
      correlation: sLL && sRR ? sLR / Math.sqrt(sLL * sRR) : 1,
      negativeCorrPct: counted ? (neg / counted) * 100 : 0,
      widthDb: clampDb(10 * Math.log10((sS + 1e-12) / (sM + 1e-12))),
      balanceDb: sRR > 0 && sLL > 0 ? 10 * Math.log10(sLL / sRR) : 0,
      monoLossDb: L.monoIntegratedLufs !== null && Number.isFinite(L.integratedLufs) ? clampDb(L.integratedLufs - L.monoIntegratedLufs) : 0,
    }
  }

  // 4. Spettro
  const S = computeSpectral(mid, side, fs, step('Spettro e frequenze', 0.4, 0.7))

  // 5. Stime
  onProgress({ stage: 'Stima del tempo (BPM)', pct: 0.72 })
  const tempo = estimateTempo(mid, fs)
  onProgress({ stage: 'Stima della tonalità', pct: 0.88 })
  const key = estimateKey(S.chroma)
  onProgress({ stage: 'Stima della struttura', pct: 0.92 })
  const sections = estimateSections(S.frameChroma, S.frameBands, S.frameTime, duration, L.shortTerm)

  // 6. Forma d'onda
  const wmin: number[] = [], wmax: number[] = []
  const buckets = Math.min(WAVE_BUCKETS, len)
  for (let b = 0; b < buckets; b++) {
    const a = Math.floor((b * len) / buckets), e = Math.floor(((b + 1) * len) / buckets)
    let mn = 0, mx = 0
    for (let i = a; i < e; i++) { const v = chs[0][i]; const w = stereo ? chs[1][i] : v; mn = Math.min(mn, v, w); mx = Math.max(mx, v, w) }
    wmin.push(Math.round(mn * 1000) / 1000); wmax.push(Math.round(mx * 1000) / 1000)
  }

  onProgress({ stage: 'Fatto', pct: 1 })
  return {
    version: 1,
    analyzedAt: Date.now(),
    duration,
    channels: input.channels.length,
    analysisSampleRate: fs,
    fileSampleRate: input.fileSampleRate,
    fileBitDepth: input.fileBitDepth,
    integratedLufs: L.integratedLufs,
    lra: L.lra,
    maxMomentary: L.maxMomentary,
    maxShortTerm: L.maxShortTerm,
    truePeakDb: L.truePeakDb,
    samplePeakDb: L.samplePeakDb,
    rmsDb: L.rmsDb,
    crestDb: L.crestDb,
    plr: L.plr,
    clippedSamples: L.clippedSamples,
    clipEvents: L.clipEvents,
    dcOffset: L.dcOffset,
    stereo: stereoRes,
    bands: S.bands,
    tiltDbPerOct: S.tiltDbPerOct,
    spectrum: S.spectrum,
    tempo,
    key,
    sections,
    timeline: { step: 0.1, shortTerm: L.shortTerm, momentary: L.momentary, correlation: corrSeries },
    waveform: { min: wmin, max: wmax },
    spectrogram: S.spectrogram,
  }
}
