import type { AudioAnalysis } from '../audio/types'
import { runChecks, type Check } from '../audio/checks'
import { buildProjectContext } from '../context'
import type { Project, Track, TrackVersion } from '../db'
import { analysisToText } from './diagnosis'

/* ============ allineamento temporale tra due versioni ============ */

/** Inviluppo di energia ogni 10 ms (dB) di un file, decodificato mono a 8 kHz. */
async function energyEnvelope(blob: Blob): Promise<Float32Array> {
  const Ctx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
  const rate = 8000
  const buf = await new Ctx(1, 1, rate).decodeAudioData(await blob.arrayBuffer())
  const hop = rate / 100, n = Math.floor(buf.length / hop)
  const env = new Float32Array(n)
  const chs = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c))
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = i * hop; j < (i + 1) * hop; j++) { let v = 0; for (const c of chs) v += c[j]; v /= chs.length; s += v * v }
    env[i] = 10 * Math.log10(s / hop + 1e-9)
  }
  return env
}

/**
 * Stima di quanti secondi B è spostata rispetto ad A (positivo = B parte più tardi),
 * correlando gli attacchi (aumenti di energia, risoluzione 10 ms) entro ±15 s.
 * confidence = correlazione normalizzata 0–1.
 */
export async function estimateOffset(blobA: Blob, blobB: Blob): Promise<{ offset: number; confidence: number }> {
  const [ea, eb] = await Promise.all([energyEnvelope(blobA), energyEnvelope(blobB)])
  const prep = (e: Float32Array) => {
    const v = new Float32Array(e.length)
    for (let i = 1; i < e.length; i++) v[i] = Math.max(0, Math.max(-70, e[i]) - Math.max(-70, e[i - 1]))
    let mu = 0; for (const y of v) mu += y; mu /= v.length || 1
    let sd = 0; for (const y of v) sd += (y - mu) ** 2; sd = Math.sqrt(sd / (v.length || 1)) || 1
    for (let i = 0; i < v.length; i++) v[i] = (v[i] - mu) / sd
    return v
  }
  const A = prep(ea), B = prep(eb)
  const maxLag = 1500
  let best = 0, bestC = -Infinity
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let s = 0, cnt = 0
    const i0 = Math.max(0, -lag), i1 = Math.min(A.length, B.length - lag)
    for (let i = i0; i < i1; i++) s += A[i] * B[i + lag]
    cnt = i1 - i0
    if (cnt < 500) continue
    const c = s / cnt
    if (c > bestC) { bestC = c; best = lag }
  }
  return { offset: best / 100, confidence: Math.max(0, Math.min(1, bestC)) }
}

/* ============ tabella delle differenze ============ */

export interface MetricRow {
  group: string
  label: string
  unit: string
  a: number | null
  b: number | null
  decimals: number
  /** variazione oltre la quale la differenza è considerata rilevante */
  threshold: number
  hint?: string
}

export function metricRows(a: AudioAnalysis, b: AudioAnalysis): MetricRow[] {
  const rows: MetricRow[] = [
    { group: 'Loudness', label: 'Loudness integrata', unit: 'LUFS', a: a.integratedLufs, b: b.integratedLufs, decimals: 1, threshold: 0.5 },
    { group: 'Loudness', label: 'True peak', unit: 'dBTP', a: a.truePeakDb, b: b.truePeakDb, decimals: 2, threshold: 0.3 },
    { group: 'Loudness', label: 'Max short-term', unit: 'LUFS', a: a.maxShortTerm, b: b.maxShortTerm, decimals: 1, threshold: 0.5 },
    { group: 'Dinamica', label: 'Loudness range', unit: 'LU', a: a.lra, b: b.lra, decimals: 1, threshold: 0.5, hint: 'più alto = più variazione tra parti piano e forti' },
    { group: 'Dinamica', label: 'PLR', unit: 'dB', a: a.plr, b: b.plr, decimals: 1, threshold: 0.5, hint: 'più basso = più compresso' },
    { group: 'Dinamica', label: 'Crest factor', unit: 'dB', a: a.crestDb, b: b.crestDb, decimals: 1, threshold: 0.5 },
    { group: 'Dinamica', label: 'Punti di clipping', unit: '', a: a.clipEvents, b: b.clipEvents, decimals: 0, threshold: 0.5 },
  ]
  if (a.stereo && b.stereo) rows.push(
    { group: 'Stereo', label: 'Correlazione', unit: '', a: a.stereo.correlation, b: b.stereo.correlation, decimals: 2, threshold: 0.05, hint: '+1 mono, 0 molto largo, negativo controfase' },
    { group: 'Stereo', label: 'Larghezza Side/Mid', unit: 'dB', a: a.stereo.widthDb, b: b.stereo.widthDb, decimals: 1, threshold: 1 },
    { group: 'Stereo', label: 'Perdita in mono', unit: 'LU', a: a.stereo.monoLossDb, b: b.stereo.monoLossDb, decimals: 1, threshold: 0.5 },
    { group: 'Stereo', label: 'Tempo in controfase', unit: '%', a: a.stereo.negativeCorrPct, b: b.stereo.negativeCorrPct, decimals: 0, threshold: 2 },
  )
  a.bands.forEach((band, i) => rows.push({ group: 'Bande (energia relativa)', label: `${band.label} ${band.lo}–${band.hi} Hz`, unit: 'dB', a: band.levelDb, b: b.bands[i]?.levelDb ?? null, decimals: 1, threshold: 1 }))
  rows.push({ group: 'Bande (energia relativa)', label: 'Pendenza spettrale', unit: 'dB/ott', a: a.tiltDbPerOct, b: b.tiltDbPerOct, decimals: 2, threshold: 0.3, hint: 'più negativo = suono più scuro' })
  rows.push(
    { group: 'File', label: 'Durata', unit: 's', a: a.duration, b: b.duration, decimals: 1, threshold: 0.5 },
    { group: 'Stime', label: 'BPM (stima)', unit: '', a: a.tempo?.bpm ?? null, b: b.tempo?.bpm ?? null, decimals: 1, threshold: 0.5 },
  )
  return rows
}

/** Spettro di B meno spettro di A (Mid), in dB, normalizzato sulla loudness: mostra solo il cambio di bilanciamento tonale. */
export function spectrumDiff(a: AudioAnalysis, b: AudioAnalysis) {
  // i due spettri sono già relativi al proprio massimo: allineiamo la media 200 Hz – 5 kHz
  const idx = a.spectrum.freqs.map((f, i) => (f >= 200 && f <= 5000 ? i : -1)).filter((i) => i >= 0)
  const mean = (v: number[]) => idx.reduce((s, i) => s + v[i], 0) / idx.length
  const shift = mean(a.spectrum.mid) - mean(b.spectrum.mid)
  return a.spectrum.freqs.map((f, i) => ({ f, d: b.spectrum.mid[i] + shift - a.spectrum.mid[i] }))
}

/* ============ controlli: risolti / nuovi ============ */

export function checksDiff(a: AudioAnalysis, b: AudioAnalysis) {
  const bad = (c: Check) => c.level === 'alert' || c.level === 'warn'
  const ca = runChecks(a).filter(bad), cb = runChecks(b).filter(bad)
  const ida = new Set(ca.map((c) => c.id + c.level)), idb = new Set(cb.map((c) => c.id + c.level))
  return {
    resolved: ca.filter((c) => !idb.has(c.id + c.level)),
    added: cb.filter((c) => !ida.has(c.id + c.level)),
    still: cb.filter((c) => ida.has(c.id + c.level)),
  }
}

/* ============ prompt AI del confronto ============ */

const COMPARE_SYSTEM = `Sei GENOS AI BRAIN, direttore creativo e tecnico personale di Genos, musicista che produce in Ableton Live. Ora CONFRONTI due versioni dello stesso brano (A = precedente, B = nuova) usando solo dati misurati.

REGOLE
1. Usa SOLO i dati forniti. Non hai ascoltato le versioni: scrivi "i dati indicano", mai "si sente".
2. Cita sempre i valori di A e B quando affermi un cambiamento.
3. Un numero che cambia non è automaticamente un miglioramento: valuta rispetto all'intenzione dell'artista (note delle versioni, richiesta, decisioni del progetto). Se l'intenzione non è chiara, dillo.
4. Distingui problemi oggettivi (clipping, controfase, true peak sopra 0) dalle scelte di gusto.
5. Rispetta le decisioni creative del progetto e non riproporre idee scartate.
6. Critico e diretto, niente complimenti di circostanza. Italiano comprensibile.
7. Interventi pratici in Ableton (dispositivi nativi), con valori indicativi da verificare a orecchio.

FORMATO (markdown)
## Verdetto
Due o tre frasi: B è un passo avanti, indietro o laterale rispetto ad A, e perché.

## Cosa è migliorato
Elenco puntato, ogni voce con i valori A → B.

## Cosa è peggiorato o è a rischio
Elenco puntato, ogni voce con i valori A → B e perché conta.

## Cosa è rimasto uguale (e andrebbe affrontato)

## Prossimi passi
Da 2 a 4 interventi concreti per la prossima versione, in ordine di priorità, ognuno con: **Diagnosi**, **Intervento consigliato**, **Alternative creative**.

## Domande
Solo se servono davvero (massimo 3).`

const REFERENCE_SYSTEM = `Sei GENOS AI BRAIN, direttore creativo e tecnico personale di Genos, musicista che produce in Ableton Live. Ora CONFRONTI il mix di Genos (A) con una REFERENCE (B): un brano di un altro artista scelto come riferimento per alcuni aspetti precisi.

REGOLE
1. Usa SOLO i dati misurati forniti. Non hai ascoltato i brani: scrivi "i dati indicano".
2. Lo scopo NON è copiare la reference: è capire su quali aspetti dichiarati (focus) il mix di A si discosta e se quella distanza è voluta. Concentrati sui focus indicati; gli altri aspetti citali solo se la differenza è grande.
3. Cita sempre i valori A e B. Ricorda che la reference è un master finito: se A è un mix non masterizzato, loudness e dinamica saranno diverse per natura: confronta il bilanciamento tonale e lo stereo, non il volume.
4. Rispetta l'identità di Genos, le decisioni del progetto e le idee scartate. Se avvicinarsi alla reference andrebbe contro una decisione del progetto, segnalalo.
5. Interventi pratici in Ableton (dispositivi nativi), valori indicativi da verificare a orecchio.
6. Critico, diretto, italiano comprensibile.

FORMATO (markdown)
## Verdetto
## Dove A si avvicina alla reference
## Dove A si discosta (con valori A → B)
Per ogni punto: **Diagnosi**, **È un problema?** (dipende dall'intenzione), **Intervento consigliato**, **Alternative creative**
## Cosa NON prendere dalla reference
## Domande`

export function buildComparePrompt(p: { project?: Project; track: Track; a: TrackVersion; b: TrackVersion; offset: number; userNote: string; reference?: Track }) {
  if (p.reference) {
    const r = p.reference
    const user = [
      p.project ? `CONTESTO DEL PROGETTO\n${buildProjectContext(p.project)}` : 'CONTESTO DEL PROGETTO: nessuno.',
      p.userNote.trim() ? `RICHIESTA SPECIFICA DELL'ARTISTA: ${p.userNote.trim()}` : 'RICHIESTA SPECIFICA: nessuna.',
      `===== A: MIX DI GENOS — "${p.track.title}", versione "${p.a.label}" =====${p.a.notes ? `\nNote: ${p.a.notes}` : ''}\n${analysisToText(p.a.analysis!)}`,
      `===== B: REFERENCE — "${r.title}"${r.artist ? ` di ${r.artist}` : ''} =====\nAspetti da prendere come riferimento (focus): ${r.refFocus?.length ? r.refFocus.join(', ') : 'non specificati'}${r.notes ? `\nPerché è una reference: ${r.notes}` : ''}\n${analysisToText(p.b.analysis!)}`,
      'Confronta seguendo esattamente il formato richiesto.',
    ]
    return { system: REFERENCE_SYSTEM, user: user.join('\n\n') }
  }
  const user = [
    p.project ? `CONTESTO DEL PROGETTO\n${buildProjectContext(p.project)}` : 'CONTESTO DEL PROGETTO: nessuno.',
    `BRANO: "${p.track.title}"`,
    p.userNote.trim() ? `RICHIESTA SPECIFICA DELL'ARTISTA: ${p.userNote.trim()}` : 'RICHIESTA SPECIFICA: nessuna.',
    `===== VERSIONE A: "${p.a.label}" =====${p.a.notes ? `\nNote dell'artista: ${p.a.notes}` : ''}\n${analysisToText(p.a.analysis!)}`,
    `===== VERSIONE B: "${p.b.label}" =====${p.b.notes ? `\nNote dell'artista: ${p.b.notes}` : ''}\n${analysisToText(p.b.analysis!)}`,
    `ALLINEAMENTO: la versione B risulta spostata di ${p.offset >= 0 ? '+' : ''}${p.offset.toFixed(1)} s rispetto ad A.`,
    'Confronta le due versioni seguendo esattamente il formato richiesto.',
  ]
  return { system: COMPARE_SYSTEM, user: user.join('\n\n') }
}
