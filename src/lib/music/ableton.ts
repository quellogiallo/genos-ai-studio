import { buildProjectContext } from '../context'
import type { Project, Track, TrackVersion } from '../db'
import { analysisToText } from './diagnosis'

export interface AbletonSetup {
  version: '12' | '11' | '10' | 'altro'
  edition: 'Suite' | 'Standard' | 'Intro' | 'Lite' | 'non so'
  os: 'macOS' | 'Windows'
  /** plugin di terze parti, controller, hardware */
  extras: string
}

export const DEFAULT_SETUP: AbletonSetup = { version: '12', edition: 'non so', os: 'macOS', extras: '' }

const SYSTEM = (setup: AbletonSetup) => `Sei l'ABLETON ASSISTANT di GENOS AI STUDIO: un tecnico esperto di Ableton Live e di produzione musicale che lavora per Genos, musicista di synthpop sperimentale. Modalità: TECNICA.

SETUP DELL'UTENTE
- Ableton Live ${setup.version}, edizione ${setup.edition}, ${setup.os}
${setup.extras.trim() ? `- Altro (plugin, controller, hardware): ${setup.extras.trim()}` : '- Nessun plugin di terze parti dichiarato: usa solo strumenti ed effetti nativi.'}

COME RISPONDI
1. Istruzioni operative passo per passo, numerate, eseguibili davanti al computer: dove cliccare, quale dispositivo trascinare da quale categoria del Browser, quale parametro girare e di quanto (valori indicativi).
2. Usa i nomi dei dispositivi e dei parametri come appaiono in Ableton (in inglese, es. "EQ Eight", "Threshold", "Sidechain"), con una breve spiegazione in italiano di cosa fanno.
3. Rispetta l'edizione: se un dispositivo non è incluso in ${setup.edition} (es. alcuni strumenti ed effetti sono solo in Suite), dillo e proponi un'alternativa disponibile. Se l'edizione è "non so", segnala quando serve Suite.
4. Se non sei sicuro dell'esatta posizione di un comando o del nome preciso di un parametro in Live ${setup.version}, dillo apertamente invece di inventare. Non inventare scorciatoie da tastiera di cui non sei certo.
5. Spiega il PERCHÉ di ogni passaggio in una frase: chi legge sta imparando.
6. Se la richiesta è ambigua (es. "come rendo la cassa più forte" senza sapere il contesto), fai al massimo 2 domande mirate prima di una risposta lunga, oppure dai la soluzione più comune dichiarando l'assunzione.
7. Se sono collegati dati misurati di un brano, usali per tarare i consigli (frequenze, loudness, stereo) e citali. Non inventare dati che non ci sono.
8. Rispetta le decisioni creative del progetto e non riproporre idee scartate.
9. Quando ha senso, chiudi con "Variante creativa": un modo non ovvio di usare la stessa tecnica in chiave sperimentale.
10. Italiano, formattazione markdown: titoli brevi, elenchi numerati per i passaggi, **grassetto** per i nomi dei dispositivi. Niente preamboli.`

export function buildAbletonSystem(p: { setup: AbletonSetup; project?: Project; track?: Track; version?: TrackVersion }) {
  const parts = [SYSTEM(p.setup)]
  if (p.project) parts.push(`CONTESTO DEL PROGETTO\n${buildProjectContext(p.project)}`)
  if (p.track && p.version?.analysis) {
    parts.push(`BRANO COLLEGATO: "${p.track.title}" — versione "${p.version.label}"${p.version.notes ? ` (note: ${p.version.notes})` : ''}\n${analysisToText(p.version.analysis)}`)
  }
  return parts.join('\n\n')
}

/** Testo unico da incollare in Claude: istruzioni + contesto + conversazione finora. */
export function buildAbletonClipboard(system: string, messages: { role: 'user' | 'assistant'; content: string }[]) {
  const convo = messages.map((m) => `${m.role === 'user' ? 'UTENTE' : 'ASSISTENTE'}:\n${m.content}`).join('\n\n')
  return `${system}\n\n---\n\nCONVERSAZIONE${messages.length > 1 ? ' (rispondi solo all\'ultimo messaggio dell\'utente)' : ''}:\n\n${convo}`
}

export const QUICK_PROMPTS = [
  'Come faccio un sidechain tra cassa e basso?',
  'Come imposto un bus di riverbero e delay con le mandate (Return)?',
  'Come automatizzo un filtro che si apre lentamente nella strofa?',
  'Come faccio resampling di una traccia per creare nuovi suoni?',
  'Come costruisco un pad evolutivo con Wavetable?',
  'Come imposto la catena sul bus della batteria?',
  'Come preparo il mix per il mastering (gain staging ed export)?',
  'Come uso le Macro in un Rack per controllare più parametri insieme?',
]
