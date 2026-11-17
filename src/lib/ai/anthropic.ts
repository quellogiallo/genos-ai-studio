import { AIError, type AIProvider, type ChatRequest, type ChatResponse, type ModelInfo } from './types'

const BASE = 'https://api.anthropic.com/v1'

function headers(apiKey: string) {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    // Necessario per chiamare l'API direttamente dal browser.
    // Accettabile perché l'app è privata e la chiave resta sul tuo dispositivo.
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

async function readError(res: Response): Promise<AIError> {
  let detail = ''
  try {
    const body = await res.json()
    detail = body?.error?.message ?? ''
  } catch {
    /* risposta non JSON */
  }
  const byStatus: Record<number, string> = {
    400: 'Richiesta non valida.',
    401: 'Chiave API non valida o revocata.',
    403: 'La chiave non ha i permessi per questa operazione.',
    404: 'Modello o endpoint non trovato.',
    429: 'Limite di richieste raggiunto, oppure credito API esaurito. Riprova tra poco o controlla il credito nella Console.',
    500: 'Errore interno di Anthropic. Riprova tra poco.',
    529: 'Anthropic è sovraccarico in questo momento. Riprova tra poco.',
  }
  const base = byStatus[res.status] ?? `Errore ${res.status}.`
  return new AIError(detail ? `${base} (${detail})` : base, res.status)
}

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AIError('Richiesta annullata.')
    throw new AIError('Impossibile raggiungere Anthropic. Controlla la connessione internet.')
  }
}

export const anthropic: AIProvider = {
  id: 'anthropic',
  label: 'Anthropic (Claude)',
  canListen: false,
  keyPrefix: 'sk-ant-',
  keyUrl: 'https://console.anthropic.com/settings/keys',
  pickDefault(models, task) {
    const ids = models.map((m) => m.id)
    const fam = task === 'fast' ? ['haiku', 'sonnet'] : ['opus', 'sonnet']
    for (const f of fam) {
      const hit = ids.filter((i) => i.includes(f)).sort().reverse()[0]
      if (hit) return hit
    }
    return ids[0]
  },

  async testConnection(apiKey) {
    if (!apiKey.trim().startsWith('sk-ant-')) {
      throw new AIError('La chiave Anthropic dovrebbe iniziare con "sk-ant-".')
    }
    const res = await safeFetch(`${BASE}/models?limit=100`, { headers: headers(apiKey.trim()) })
    if (!res.ok) throw await readError(res)
    const body = await res.json()
    return (body.data ?? []).map((m: { id: string; display_name?: string }): ModelInfo => ({
      id: m.id,
      name: m.display_name ?? m.id,
    }))
  },

  async chat(apiKey, req: ChatRequest): Promise<ChatResponse> {
    if (req.audio) throw new AIError('Claude non può ascoltare file audio. Usa Gemini per l\'ascolto.')
    const res = await safeFetch(`${BASE}/messages`, {
      method: 'POST',
      headers: headers(apiKey.trim()),
      signal: req.signal,
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 2048,
        system: req.system,
        messages: req.images?.length
          ? req.messages.map((m, i) => (i === req.messages.length - 1 && m.role === 'user'
            ? { role: 'user', content: [...req.images!.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.base64 } })), { type: 'text', text: m.content }] }
            : m))
          : req.messages,
      }),
    })
    if (!res.ok) throw await readError(res)
    const body = await res.json()
    const text = (body.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n')
    return {
      text,
      model: body.model,
      inputTokens: body.usage?.input_tokens,
      outputTokens: body.usage?.output_tokens,
    }
  },
}
