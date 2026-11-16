import type { AnalysisProgress, AudioAnalysis } from './types'

export const ANALYSIS_RATE = 48000
export const MAX_FILE_MB = 250
export const ACCEPT = 'audio/*,.wav,.aif,.aiff,.mp3,.m4a,.aac,.flac,.ogg,.opus'

/** Legge sample rate e bit depth dall'intestazione WAV/AIFF (se presente). */
export async function readFileInfo(file: File): Promise<{ sampleRate?: number; bitDepth?: number }> {
  const buf = new DataView(await file.slice(0, 4096).arrayBuffer())
  const tag = (o: number) => String.fromCharCode(buf.getUint8(o), buf.getUint8(o + 1), buf.getUint8(o + 2), buf.getUint8(o + 3))
  try {
    if (tag(0) === 'RIFF' && tag(8) === 'WAVE') {
      let o = 12
      while (o + 8 < buf.byteLength) {
        const id = tag(o), size = buf.getUint32(o + 4, true)
        if (id === 'fmt ') return { sampleRate: buf.getUint32(o + 12, true), bitDepth: buf.getUint16(o + 22, true) }
        o += 8 + size + (size % 2)
      }
    }
    if (tag(0) === 'FORM' && (tag(8) === 'AIFF' || tag(8) === 'AIFC')) {
      let o = 12
      while (o + 8 < buf.byteLength) {
        const id = tag(o), size = buf.getUint32(o + 4, false)
        if (id === 'COMM') {
          const bitDepth = buf.getUint16(o + 14, false)
          // sample rate in formato 80-bit extended
          const exp = buf.getUint16(o + 16, false) & 0x7fff
          const hi = buf.getUint32(o + 18, false)
          const sampleRate = Math.round(hi * Math.pow(2, exp - 16383 - 31))
          return { sampleRate, bitDepth }
        }
        o += 8 + size + (size % 2)
      }
    }
  } catch { /* intestazione non leggibile: nessun dato */ }
  return {}
}

/** Decodifica il file in PCM a 48 kHz. */
export async function decodeFile(file: File): Promise<AudioBuffer> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`File troppo grande (${(file.size / 1048576).toFixed(0)} MB). Limite: ${MAX_FILE_MB} MB. Esporta una versione più corta o compressa.`)
  }
  const data = await file.arrayBuffer()
  const Ctx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
  const ctx = new Ctx(2, 1, ANALYSIS_RATE)
  try {
    return await ctx.decodeAudioData(data)
  } catch {
    throw new Error(`Il browser non riesce a leggere "${file.name}". Formati sicuri: WAV, MP3, M4A/AAC. FLAC e OGG funzionano solo su alcuni browser.`)
  }
}

/** Esegue l'analisi completa in un Web Worker. */
export async function analyzeFile(file: File, onProgress: (p: AnalysisProgress) => void): Promise<AudioAnalysis> {
  onProgress({ stage: 'Decodifica del file', pct: 0 })
  const [info, buffer] = await Promise.all([readFileInfo(file), decodeFile(file)])
  if (buffer.duration < 1) throw new Error('Il file dura meno di un secondo: troppo corto per un\'analisi.')
  const channels: Float32Array[] = []
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) channels.push(buffer.getChannelData(c).slice())

  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e) => {
      const m = e.data
      if (m.type === 'progress') onProgress({ stage: m.stage, pct: m.pct })
      else if (m.type === 'done') { w.terminate(); resolve({ ...m.result, channels: buffer.numberOfChannels }) }
      else if (m.type === 'error') { w.terminate(); reject(new Error(`Errore durante l'analisi: ${m.message}`)) }
    }
    w.onerror = (e) => { w.terminate(); reject(new Error(`Errore durante l'analisi: ${e.message || 'memoria insufficiente o browser non compatibile'}`)) }
    w.postMessage(
      { channels, sampleRate: buffer.sampleRate, fileSampleRate: info.sampleRate, fileBitDepth: info.bitDepth },
      channels.map((c) => c.buffer),
    )
  })
}
