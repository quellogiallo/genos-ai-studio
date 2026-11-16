import { getSetting } from '../db'
import { anthropic } from './anthropic'
import { AIError, type AIProvider, type ChatRequest, type ProviderId } from './types'

export * from './types'

export const providers: Record<ProviderId, AIProvider> = { anthropic }

/**
 * Compiti dell'app → quale modello usare.
 * L'utente può cambiarli in Impostazioni; questi sono i default.
 */
export type TaskId = 'creative' | 'critical' | 'technical' | 'fast'

export const TASKS: Record<TaskId, { label: string; hint: string }> = {
  creative: { label: 'Creativo', hint: 'Brainstorming, concept, idee originali' },
  critical: { label: 'Critico / analisi', hint: 'Diagnosi mix, critica di testi e idee' },
  technical: { label: 'Tecnico', hint: 'Istruzioni Ableton, sound design, routing' },
  fast: { label: 'Veloce', hint: 'Riassunti, titoli, operazioni leggere' },
}

export interface TaskRouting {
  provider: ProviderId
  model: string
}

export const DEFAULT_ROUTING: Record<TaskId, TaskRouting> = {
  creative: { provider: 'anthropic', model: 'claude-opus-5-5' },
  critical: { provider: 'anthropic', model: 'claude-opus-5-5' },
  technical: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
  fast: { provider: 'anthropic', model: 'claude-haiku-5-5' },
}

export async function getApiKey(provider: ProviderId): Promise<string> {
  const keys = await getSetting<Record<string, string>>('apiKeys', {})
  return keys[provider] ?? ''
}

export async function getRouting(): Promise<Record<TaskId, TaskRouting>> {
  const saved = await getSetting<Partial<Record<TaskId, TaskRouting>>>('routing', {})
  return { ...DEFAULT_ROUTING, ...saved }
}

/** Punto unico per chiamare l'AI: sceglie provider e modello in base al compito. */
export async function runTask(task: TaskId, req: Omit<ChatRequest, 'model'>) {
  const route = (await getRouting())[task]
  const key = await getApiKey(route.provider)
  if (!key) {
    throw new AIError('Nessuna chiave API configurata. Vai in Impostazioni per aggiungerla.')
  }
  return providers[route.provider].chat(key, { ...req, model: route.model })
}
