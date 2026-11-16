import type { AudioAnalysis } from '../audio/types'
import { runChecks } from '../audio/checks'
import { buildProjectContext } from '../context'
import type { Project, Track, TrackVersion } from '../db'

/* ======================================================================
   Testo dei dati misurati — è l'UNICA base su cui l'AI può ragionare.
   ====================================================================== */

const n = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? 'n.d.' : Number.isFinite(v) ? v.toFixed(d) : v > 0 ? '+inf' : '-inf')
const t = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function sectionStats(a: AudioAnalysis) {
  const c = a.timeline.correlation
  return a.sections.map((s) => {
    let corr: number | null = null
    if (c) {
      const i0 = Math.floor(s.start / 0.1), i1 = Math.min(c.length, Math.ceil(s.end / 0.1))
      const seg = c.slice(i0, i1)
      if (seg.length) corr = seg.reduce((x, y) => x + y, 0) / seg.length
    }
    return `- ${s.label} ${t(s.start)}–${t(s.end)} · loudness media ${n(s.loudness)} LUFS${corr !== null ? ` · correlazione media ${n(corr, 2)}` : ''}`
  }).join('\n')
}

function spectrumThird(a: AudioAnalysis) {
  // riduce lo spettro a circa 1/3 di ottava
  const { freqs, mid, side } = a.spectrum
  const out: string[] = []
  for (let i = 0; i < freqs.length; i += 4) {
    const f = freqs[i]
    out.push(`${f >= 1000 ? (f / 1000).toFixed(1) + 'k' : Math.round(f)}Hz: ${n(mid[i])}${side ? ` / ${n(side[i])}` : ''}`)
  }
  return out.join(' · ')
}

export function analysisToText(a: AudioAnalysis): string {
  const s = a.stereo
  const checks = runChecks(a).filter((c) => c.level !== 'ok')
  return `DATI MISURATI DAL FILE (analisi automatica nel browser, decodifica a ${a.analysisSampleRate / 1000} kHz)

FILE: durata ${t(a.duration)} · ${a.channels} canali · sample rate originale ${a.fileSampleRate ? a.fileSampleRate + ' Hz' : 'n.d.'} · bit depth ${a.fileBitDepth ?? 'n.d.'}

LOUDNESS E DINAMICA (EBU R128 / ITU-R BS.1770-4):
- Loudness integrata: ${n(a.integratedLufs)} LUFS
- Loudness range (LRA): ${n(a.lra)} LU
- Max momentary: ${n(a.maxMomentary)} LUFS · Max short-term: ${n(a.maxShortTerm)} LUFS
- True peak (4x): ${n(a.truePeakDb, 2)} dBTP · Picco campione: ${n(a.samplePeakDb, 2)} dBFS
- RMS: ${n(a.rmsDb)} dBFS · Crest factor: ${n(a.crestDb)} dB · PLR: ${n(a.plr)} dB
- Clipping: ${a.clipEvents} punti (${a.clippedSamples} campioni consecutivi a fondo scala) · DC offset: ${n(a.dcOffset * 100, 3)}%

STEREO:
${s ? `- Correlazione media: ${n(s.correlation, 2)} · tempo con correlazione negativa: ${n(s.negativeCorrPct, 0)}%
- Larghezza (Side/Mid): ${n(s.widthDb)} dB · Bilanciamento L/R: ${n(s.balanceDb, 2)} dB (positivo = sinistra più forte)
- Perdita sommando in mono: ${n(s.monoLossDb)} LU` : '- File mono: nessuna misura stereo'}

BANDE (energia rispetto al totale · larghezza Side/Mid; -60 = mono, 0 = Side uguale a Mid):
${a.bands.map((b) => `- ${b.label} ${b.lo}-${b.hi} Hz: ${n(b.levelDb)} dB${b.widthDb !== null ? ` · larghezza ${n(b.widthDb)} dB` : ''}`).join('\n')}
- Pendenza spettrale media 100 Hz–10 kHz: ${n(a.tiltDbPerOct)} dB/ottava (rumore rosa = -3)

SPETTRO MEDIO (dB relativi al massimo, Mid${s ? ' / Side' : ''}, circa 1/3 di ottava):
${spectrumThird(a)}

STIME ALGORITMICHE (possono essere errate):
- BPM: ${a.tempo ? `${a.tempo.bpm} (affidabilità ${Math.round(a.tempo.confidence * 100)}%; alternative metà/doppio: ${a.tempo.alternatives.join(', ') || 'nessuna'})` : 'non rilevabile'}
- Tonalità: ${a.key ? `${a.key.key} (affidabilità ${Math.round(a.key.confidence * 100)}%; alternativa: ${a.key.alternative})` : 'non rilevabile'}
- Sezioni (stessa lettera = timbro/armonia simili):
${sectionStats(a)}

CONTROLLI AUTOMATICI SEGNALATI (regole a soglia fissa):
${checks.length ? checks.map((c) => `- [${c.level}] ${c.title}: ${c.value}`).join('\n') : '- nessuna segnalazione'}

NON MISURATO: quali strumenti suonano, timbro dei singoli elementi, rapporto voce/base, qualità della performance, riverberi e spazialità dei singoli suoni, testo.`
}

function compareText(prev: TrackVersion, cur: AudioAnalysis): string {
  const p = prev.analysis!
  const d = (a: number, b: number, dec = 1) => (Number.isFinite(a) && Number.isFinite(b) ? `${a - b >= 0 ? '+' : ''}${(a - b).toFixed(dec)}` : 'n.d.')
  return `CONFRONTO CON LA VERSIONE PRECEDENTE "${prev.label}"${prev.notes ? ` (note: ${prev.notes})` : ''}:
- Loudness ${d(cur.integratedLufs, p.integratedLufs)} LU · True peak ${d(cur.truePeakDb, p.truePeakDb, 2)} dB · LRA ${d(cur.lra, p.lra)} LU · PLR ${d(cur.plr, p.plr)} dB
${cur.stereo && p.stereo ? `- Correlazione ${d(cur.stereo.correlation, p.stereo.correlation, 2)} · Larghezza ${d(cur.stereo.widthDb, p.stereo.widthDb)} dB\n` : ''}- Bande: ${cur.bands.map((b, i) => `${b.label} ${d(b.levelDb, p.bands[i].levelDb)}`).join(', ')}`
}

/* ======================================================================
   Prompt
   ====================================================================== */

const DIAGNOSIS_SYSTEM = `Sei GENOS AI BRAIN, direttore creativo e tecnico personale di Genos, musicista che produce in Ableton Live. In questo momento lavori in modalità CRITICA + TECNICA: diagnosi di mix e master a partire da dati misurati.

REGOLE
1. Usa SOLO i dati misurati forniti. Non inventare valori, strumenti, frequenze o problemi che i dati non mostrano. Non hai ascoltato il brano: non scrivere "si sente", scrivi "i dati indicano".
2. Ogni punto deve citare almeno un valore misurato.
3. Separa i problemi oggettivi (clipping, controfase, true peak sopra 0, DC offset) dalle scelte che dipendono dal genere e dall'intenzione (loudness, dinamica, bilanciamento tonale, larghezza): queste ultime presentale come rischi o domande, non come errori.
4. Le stime (BPM, tonalità, sezioni) hanno un'affidabilità indicata: usale con cautela e solo se servono.
5. Rispetta le decisioni creative del progetto e non riproporre le idee scartate, nemmeno in forma simile.
6. Sii critico e diretto, niente complimenti di circostanza. Se un aspetto è tecnicamente solido, dillo in una riga e passa oltre.
7. Interventi concreti: valori indicativi (frequenze, dB, ratio, attacco/rilascio) e in quale dispositivo nativo di Ableton farli (EQ Eight, Compressor, Glue Compressor, Multiband Dynamics, Saturator, Drum Buss, Utility, Limiter, Spectrum...). Ricorda che sono punti di partenza da verificare a orecchio.
8. Scrivi in italiano comprensibile: chi legge è un musicista, non un ingegnere del suono. Spiega i termini tecnici la prima volta che li usi.
9. Se mancano informazioni decisive (genere di riferimento, destinazione: streaming, club, vinile), fai al massimo 3 domande mirate alla fine invece di dare per scontato.

FORMATO DELLA RISPOSTA (markdown, esattamente questa struttura)
## Sintesi
Due o tre frasi: stato generale e le priorità.

Poi da 3 a 6 punti in ordine di priorità, ognuno così:
## 1. Titolo breve
**Priorità:** alta / media / bassa
**Dati:** i valori misurati su cui ti basi
**Diagnosi:** cosa mostrano i dati
**Problema:** perché è un problema o un rischio
**Possibile causa:** cause plausibili, dalla più probabile
**Intervento consigliato:** passi concreti in Ableton
**Alternative creative:** una o due strade non ovvie che trasformano il limite in carattere, coerenti con il progetto

## Cosa non posso valutare
Cosa servirebbe ascoltare per completare la diagnosi.

## Domande
Solo se servono davvero.`

const LISTEN_SYSTEM = `Sei GENOS AI BRAIN, direttore creativo e tecnico personale di Genos, musicista che produce in Ableton Live. Ora ASCOLTI il file audio allegato e hai anche i dati misurati dal file.

REGOLE
1. Quello che descrivi ascoltando è una PERCEZIONE del modello, non una misura: usa formule come "mi sembra", "probabilmente", e indica l'incertezza.
2. Quando una percezione coincide con un dato misurato, citalo. Quando la contraddice, segnalalo: il dato misurato vince sui numeri (loudness, picchi, correlazione).
3. Non inventare testi: se trascrivi parole, dichiara che la trascrizione è incerta.
4. Rispetta le decisioni creative del progetto e non riproporre le idee scartate.
5. Sii critico e concreto, niente complimenti di circostanza.
6. Italiano comprensibile, interventi pensati per Ableton Live.

FORMATO DELLA RISPOSTA (markdown)
## Cosa sento
Strumenti e suoni riconosciuti (con grado di certezza), voce, carattere generale.

## Arrangiamento
Sezione per sezione con i tempi (mm:ss): cosa entra, cosa esce, come cambia l'energia. Usa le sezioni stimate come riferimento ma correggile se senti altro.

Poi da 2 a 5 osservazioni sul mix e sull'arrangiamento, in ordine di priorità, ognuna così:
## 1. Titolo breve
**Priorità:** alta / media / bassa
**Diagnosi:** cosa percepisci (e quale dato lo conferma, se c'è)
**Problema:** perché conta
**Possibile causa:** cause plausibili
**Intervento consigliato:** passi concreti in Ableton
**Alternative creative:** una o due strade non ovvie coerenti con il progetto

## Limiti di questo ascolto
Cosa non riesci a valutare con sicurezza.`

export interface PromptInput {
  project?: Project
  track: Track
  version: TrackVersion
  previous?: TrackVersion
  userNote: string
}

function userMessage(p: PromptInput, task: string) {
  const a = p.version.analysis!
  return [
    p.project ? `CONTESTO DEL PROGETTO\n${buildProjectContext(p.project)}` : 'CONTESTO DEL PROGETTO: nessuno.',
    `BRANO: "${p.track.title}"${p.track.notes ? ` — note: ${p.track.notes}` : ''}\nVERSIONE: "${p.version.label}" (file ${p.version.fileName})${p.version.notes ? `\nNOTE DELL'ARTISTA SU QUESTA VERSIONE: ${p.version.notes}` : ''}`,
    p.userNote.trim() ? `RICHIESTA SPECIFICA DELL'ARTISTA: ${p.userNote.trim()}` : 'RICHIESTA SPECIFICA: nessuna, fai una diagnosi generale.',
    analysisToText(a),
    p.previous?.analysis ? compareText(p.previous, a) : '',
    task,
  ].filter(Boolean).join('\n\n')
}

export function buildDiagnosisPrompt(p: PromptInput) {
  return { system: DIAGNOSIS_SYSTEM, user: userMessage(p, 'Fai la diagnosi seguendo esattamente il formato richiesto.') }
}

export function buildListenPrompt(p: PromptInput) {
  return { system: LISTEN_SYSTEM, user: userMessage(p, 'Ascolta il file allegato e rispondi seguendo esattamente il formato richiesto.') }
}

/** Un unico testo da incollare in una chat di Claude (usa l'abbonamento, nessuna API). */
export function buildClipboardPrompt(p: PromptInput) {
  const { system, user } = buildDiagnosisPrompt(p)
  return `${system}\n\n---\n\n${user}`
}

/* ======================================================================
   Audio per l'ascolto (Gemini): mono, 16 kHz, WAV 16 bit
   ====================================================================== */

export const LISTEN_MAX_SECONDS = 8 * 60

export async function prepareListeningAudio(blob: Blob): Promise<{ mime: string; base64: string; trimmed: boolean }> {
  const Ctx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
  const rate = 16000
  const buf = await new Ctx(1, 1, rate).decodeAudioData(await blob.arrayBuffer())
  const len = Math.min(buf.length, LISTEN_MAX_SECONDS * rate)
  const mono = new Float32Array(len)
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < len; i++) mono[i] += d[i] / buf.numberOfChannels
  }
  const bytes = new ArrayBuffer(44 + len * 2)
  const v = new DataView(bytes)
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, len * 2, true)
  for (let i = 0; i < len; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, mono[i])) * 0x7fff, true)
  const base64 = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1])
    r.onerror = () => rej(new Error('Conversione audio non riuscita.'))
    r.readAsDataURL(new Blob([bytes], { type: 'audio/wav' }))
  })
  return { mime: 'audio/wav', base64, trimmed: buf.length > len }
}
