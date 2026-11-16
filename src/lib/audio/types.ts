/**
 * Risultato dell'analisi audio. Tutti i valori sono MISURATI dal file,
 * tranne quelli marcati come "stima" (BPM, tonalità, sezioni), che sono
 * calcolati con algoritmi statistici e possono sbagliare.
 */

export interface BandInfo {
  id: string
  label: string
  lo: number
  hi: number
  /** energia relativa della banda (dB, rispetto al totale) */
  levelDb: number
  /** rapporto Side/Mid nella banda (dB). Più alto = più largo. -Infinity = mono */
  widthDb: number | null
}

export interface Section {
  start: number
  end: number
  /** lettera di somiglianza: sezioni con la stessa lettera si somigliano */
  label: string
  /** loudness media della sezione (LUFS short-term medio) */
  loudness: number
}

export interface AudioAnalysis {
  version: 1
  analyzedAt: number
  // --- file ---
  duration: number
  channels: number
  analysisSampleRate: number
  fileSampleRate?: number
  fileBitDepth?: number
  // --- loudness (EBU R128 / ITU-R BS.1770-4) ---
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
  // --- stereo ---
  stereo: null | {
    correlation: number
    /** percentuale di tempo con correlazione negativa */
    negativeCorrPct: number
    widthDb: number
    balanceDb: number
    monoLossDb: number
  }
  // --- spettro ---
  bands: BandInfo[]
  /** pendenza spettrale media dB/ottava (100 Hz – 10 kHz) */
  tiltDbPerOct: number
  spectrum: { freqs: number[]; mid: number[]; side: number[] | null }
  // --- stime ---
  tempo: { bpm: number; confidence: number; alternatives: number[] } | null
  key: { key: string; confidence: number; alternative: string } | null
  sections: Section[]
  // --- serie temporali per i grafici ---
  timeline: {
    /** passo in secondi tra i punti */
    step: number
    shortTerm: number[]
    momentary: number[]
    correlation: number[] | null
  }
  /** inviluppo forma d'onda: coppie min/max */
  waveform: { min: number[]; max: number[] }
  spectrogram: { cols: number; rows: number; data: Uint8Array; fMin: number; fMax: number }
}

export type AnalysisProgress = { stage: string; pct: number }
