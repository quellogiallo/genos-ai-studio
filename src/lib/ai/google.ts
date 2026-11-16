import { AIError, type AIProvider, type ChatRequest, type ChatResponse, type ModelInfo } from './types'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

async function readError(res: Response): Promise<AIError> {
  let detail = ''
  try { detail = (await res.json())?.error?.message ?? '' } catch { /* non JSON */ }
  const byStatus: Record<number, string> = {
    400: 'Richiesta non valida (chiave errata o modello non disponibile).',
    403: 'Chiave non valida o API Gemini non abilitata per questo progetto.',
    404: 'Modello non trovato.',
    429: 'Limite gratuito raggiunto (richieste al minuto o al giorno). Riprova più tardi: la quota giornaliera si azzera alle 9:00 italiane circa.',
    500: 'Errore interno di Google. Riprova tra poco.',
    503: 'Gemini è sovraccarico in questo momento. Riprova tra poco.',
  }
  const base = byStatus[res.status] ?? `Errore ${res.status}.`
  return new AIError(detail ? `${base} (${detail})` : base, res.status)
}

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AIError('Richiesta annullata.')
    throw new AIError('Impossibile raggiungere Google. Controlla la connessione internet.')
  }
}

/** numero di versione nel nome (es. gemini-2.5-flash → 2.5) per ordinare */
const ver = (id: string) => parseFloat(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? '0')

export const google: AIProvider = {
  id: 'google',
  label: 'Google (Gemini)',
  canListen: true,
  keyPrefix: 'AIza',
  keyUrl: 'https://aistudio.google.com/apikey',

  pickDefault(models, task) {
    const usable = models.filter((m) => /gemini/.test(m.id) && !/(preview|exp|image|tts|live|embedding|audio|lite|thinking|computer|robotics|nano)/.test(m.id))
    const pool = usable.length ? usable : models.filter((m) => /gemini/.test(m.id))
    const sorted = [...pool].sort((a, b) => ver(b.id) - ver(a.id))
    // sul piano gratuito i modelli "flash" sono quelli con più quota: li preferiamo sempre
    const flash = sorted.find((m) => m.id.includes('flash'))
    return (task === 'fast' ? flash : flash ?? sorted[0])?.id ?? sorted[0]?.id
  },

  async testConnection(apiKey) {
    const key = apiKey.trim()
    if (!key.startsWith('AIza')) throw new AIError('La chiave Gemini dovrebbe iniziare con "AIza".')
    const res = await safeFetch(`${BASE}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } })
    if (!res.ok) throw await readError(res)
    const body = await res.json()
    return (body.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: { name: string; displayName?: string }): ModelInfo => {
        const id = m.name.replace(/^models\//, '')
        return { id, name: m.displayName ? `${m.displayName} (${id})` : id }
      })
  },

  async chat(apiKey, req: ChatRequest): Promise<ChatResponse> {
    const contents = req.messages.map((m, i) => {
      const parts: object[] = [{ text: m.content }]
      // l'audio va allegato all'ultimo messaggio dell'utente
      if (req.audio && i === req.messages.length - 1 && m.role === 'user') {
        parts.unshift({ inline_data: { mime_type: req.audio.mime, data: req.audio.base64 } })
      }
      return { role: m.role === 'assistant' ? 'model' : 'user', parts }
    })
    const res = await safeFetch(`${BASE}/models/${encodeURIComponent(req.model)}:generateContent`, {
      method: 'POST',
      signal: req.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey.trim() },
      body: JSON.stringify({
        ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
        contents,
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 8192,
          ...(req.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    })
    if (!res.ok) throw await readError(res)
    const body = await res.json()
    const cand = body.candidates?.[0]
    const text = (cand?.content?.parts ?? []).filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought).map((p: { text: string }) => p.text).join('')
    if (!text) {
      const reason = cand?.finishReason ?? body.promptFeedback?.blockReason
      throw new AIError(reason === 'MAX_TOKENS'
        ? 'La risposta è stata interrotta per lunghezza. Riprova.'
        : `Gemini non ha restituito testo${reason ? ` (motivo: ${reason})` : ''}.`)
    }
    return {
      text,
      model: body.modelVersion ?? req.model,
      inputTokens: body.usageMetadata?.promptTokenCount,
      outputTokens: body.usageMetadata?.candidatesTokenCount,
    }
  },
}
