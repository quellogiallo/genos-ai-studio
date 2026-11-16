import { getSetting } from '../db'
import { anthropic } from './anthropic'
import { google } from './google'
import { AIError, type AIProvider, type ChatRequest, type ModelInfo, type ProviderId } from './types'

export * from './types'

export const providers: Record<ProviderId, AIProvider> = { anthropic, google }
export const PROVIDER_IDS = Object.keys(providers) as ProviderId[]

/**
 * Compiti dell'app → quale modello usare.
 * L'utente può cambiarli in Impostazioni; se non lo fa, l'app sceglie
 * in base alle chiavi disponibili.
 */
export type TaskId = 'creative' | 'critical' | 'technical' | 'fast' | 'listen'

export const TASKS: Record<TaskId, { label: string; hint: string; strength: 'strong' | 'fast'; needsAudio?: boolean }> = {
  creative: { label: 'Creativo', hint: 'Brainstorming, concept, idee originali', strength: 'strong' },
  critical: { label: 'Critico / analisi', hint: 'Diagnosi mix, critica di testi e idee', strength: 'strong' },
  technical: { label: 'Tecnico', hint: 'Istruzioni Ableton, sound design, routing', strength: 'strong' },
  fast: { label: 'Veloce', hint: 'Riassunti, titoli, operazioni leggere', strength: 'fast' },
  listen: { label: 'Ascolto audio', hint: 'Il modello ascolta il file (solo Gemini)', strength: 'strong', needsAudio: true },
}

export interface TaskRouting {
  provider: ProviderId
  model: string
}

export async function getApiKey(provider: ProviderId): Promise<string> {
  const keys = await getSetting<Record<string, string>>('apiKeys', {})
  return keys[provider] ?? ''
}

export async function getModels(provider: ProviderId): Promise<ModelInfo[]> {
  return getSetting<ModelInfo[]>(`models.${provider}`, [])
}

/** Provider che hanno una chiave salvata e verificata. */
export async function availableProviders(): Promise<ProviderId[]> {
  const keys = await getSetting<Record<string, string>>('apiKeys', {})
  return PROVIDER_IDS.filter((p) => !!keys[p])
}

/**
 * Instradamento effettivo: le scelte salvate dall'utente se valide,
 * altrimenti un default automatico tra i provider disponibili
 * (Claude preferito per ragionamento, Gemini per l'ascolto).
 */
export async function getRouting(): Promise<Partial<Record<TaskId, TaskRouting>>> {
  const saved = await getSetting<Partial<Record<TaskId, TaskRouting>>>('routing', {})
  const avail = await availableProviders()
  const out: Partial<Record<TaskId, TaskRouting>> = {}
  for (const t of Object.keys(TASKS) as TaskId[]) {
    const info = TASKS[t]
    const s = saved[t]
    if (s && avail.includes(s.provider) && (!info.needsAudio || providers[s.provider].canListen)) { out[t] = s; continue }
    const order: ProviderId[] = info.needsAudio ? ['google'] : ['anthropic', 'google']
    for (const p of order) {
      if (!avail.includes(p)) continue
      const model = providers[p].pickDefault(await getModels(p), info.strength)
      if (model) { out[t] = { provider: p, model }; break }
    }
  }
  return out
}

/** Punto unico per chiamare l'AI: sceglie provider e modello in base al compito. */
export async function runTask(task: TaskId, req: Omit<ChatRequest, 'model'>) {
  const route = (await getRouting())[task]
  if (!route) {
    throw new AIError(TASKS[task].needsAudio
      ? 'Per l\'ascolto serve una chiave Gemini (gratuita). Aggiungila in Impostazioni.'
      : 'Nessuna chiave API configurata. Aggiungine una in Impostazioni, oppure usa "Copia per Claude".')
  }
  const key = await getApiKey(route.provider)
  const res = await providers[route.provider].chat(key, { ...req, model: route.model })
  return { ...res, provider: route.provider }
}
