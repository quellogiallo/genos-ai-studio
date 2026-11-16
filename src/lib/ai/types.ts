/**
 * Livello AI unico: ogni provider implementa la stessa interfaccia,
 * così l'app può scegliere il modello più adatto al compito
 * senza cambiare l'interfaccia utente.
 */

export type ProviderId = 'anthropic' // in futuro: 'google' | 'openai'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  model: string
  system?: string
  messages: ChatMessage[]
  maxTokens?: number
  signal?: AbortSignal
}

export interface ChatResponse {
  text: string
  model: string
  inputTokens?: number
  outputTokens?: number
}

export interface ModelInfo {
  id: string
  name: string
}

export interface AIProvider {
  id: ProviderId
  label: string
  /** Verifica la chiave e restituisce i modelli disponibili. */
  testConnection(apiKey: string): Promise<ModelInfo[]>
  chat(apiKey: string, req: ChatRequest): Promise<ChatResponse>
}

/** Errore leggibile da mostrare all'utente. */
export class AIError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}
