/// <reference lib="webworker" />
import { analyzeAudio, type AnalyzeInput } from './analyze'

// L'analisi gira in un thread separato: l'interfaccia resta fluida.
self.onmessage = (e: MessageEvent<AnalyzeInput>) => {
  try {
    const result = analyzeAudio(e.data, (p) => self.postMessage({ type: 'progress', ...p }))
    self.postMessage({ type: 'done', result }, [result.spectrogram.data.buffer])
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message ?? String(err) })
  }
}
