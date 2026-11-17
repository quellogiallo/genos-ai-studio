/**
 * Livello AI unico: ogni provider implementa la stessa interfaccia,
 * così l'app può scegliere il modello più adatto al compito
 * senza cambiare l'interfaccia utente.
 */

export type ProviderId = 'anthropic' | 'google' // in futuro: 'openai'

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
  /** audio da far "ascoltare" al modello (solo provider che lo supportano) */
  audio?: { mime: string; base64: string }
  /** immagini da far "guardare" al modello (Claude e Gemini) */
  images?: { mime: string; base64: string }[]
  /** chiede una risposta in formato JSON (se il provider lo supporta) */
  json?: boolean
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
  /** il provider accetta file audio in input */
  canListen: boolean
  keyPrefix: string
  keyUrl: string
  /** sceglie un modello predefinito ragionevole dalla lista disponibile */
  pickDefault(models: ModelInfo[], task: 'strong' | 'fast'): string | undefined
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
