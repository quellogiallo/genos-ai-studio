import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { availableProviders, runTask, type TaskId } from '../lib/ai'
import { useApp } from './AppState'

export interface RunnerPrompt {
  task: TaskId
  system: string
  user: string
  maxTokens: number
  /** risposta in JSON (default true); false per testo/markdown */
  json?: boolean
}

/**
 * Esegue un passo AI in due modi, entrambi reali:
 * 1) con una chiave salvata (Claude o Gemini): chiamata diretta dall'app;
 * 2) senza chiave: copi il prompt, lo incolli in una chat di Claude
 *    (abbonamento) e incolli qui la risposta.
 * In entrambi i casi la risposta passa dallo stesso controllo (onResult).
 */
export default function AiRunner({ label, build, onResult, disabledReason }: {
  label: string
  build: () => RunnerPrompt | Promise<RunnerPrompt>
  /** Deve lanciare un errore leggibile se la risposta non è utilizzabile. */
  onResult: (text: string) => void | Promise<void>
  disabledReason?: string
}) {
  const { toast } = useApp()
  // basta una chiave qualsiasi (Claude o Gemini): runTask sceglie il modello disponibile
  const hasKey = useLiveQuery(async () => (await availableProviders()).length > 0, [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [manual, setManual] = useState(false)
  const [pasted, setPasted] = useState('')
  const [meta, setMeta] = useState('')
  const abort = useRef<AbortController | null>(null)

  async function run() {
    setBusy(true); setError(''); setMeta('')
    abort.current = new AbortController()
    try {
      const p = await build()
      const r = await runTask(p.task, {
        system: p.system, messages: [{ role: 'user', content: p.user }], maxTokens: p.maxTokens, signal: abort.current.signal, json: p.json ?? true,
      })
      await onResult(r.text)
      setMeta(`${r.model} · ${r.inputTokens ?? '?'} in / ${r.outputTokens ?? '?'} out token`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function copyPrompt() {
    try {
      const p = await build()
      const text = `${p.system}\n\n---\n\n${p.user}`
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        // browser senza permesso appunti: ripiego con selezione manuale
        const ta = document.createElement('textarea')
        ta.value = text
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        ta.remove()
        if (!ok) throw new Error('Il browser ha bloccato la copia negli appunti.')
      }
      toast('Prompt copiato: incollalo in una chat di Claude')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function usePasted() {
    setError('')
    try {
      await onResult(pasted)
      setPasted('')
      toast('Risposta importata')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const showManual = manual || hasKey === false

  return (
    <div className="airun">
      {disabledReason ? (
        <div className="label">{disabledReason}</div>
      ) : (
        <>
          {hasKey && (
            <div className="row">
              <button className="btn primary" type="button" disabled={busy} onClick={run}>
                {busy ? <><div className="spinner" /> Sto lavorando…</> : label}
              </button>
              {busy && <button className="btn ghost sm" type="button" onClick={() => abort.current?.abort()}>Annulla</button>}
              {!busy && <button className="btn ghost sm" type="button" onClick={() => setManual((m) => !m)}>{manual ? 'Chiudi modalità manuale' : 'Copia per Claude'}</button>}
              {meta && <span className="label">{meta}</span>}
            </div>
          )}
          {showManual && (
            <div className="manual">
              <div className="label y">{label} — con il tuo abbonamento Claude</div>
              <ol className="manual-steps">
                <li>Copia il prompt.</li>
                <li>Incollalo in una nuova chat di Claude (app o sito) e invia.</li>
                <li>Copia tutta la risposta e incollala qui sotto.</li>
              </ol>
              <button className="btn sm" type="button" onClick={copyPrompt}>Copia prompt</button>
              <textarea className="textarea mono" style={{ marginTop: 10, fontSize: 13 }} rows={4} placeholder="Incolla qui la risposta di Claude" value={pasted} onChange={(e) => setPasted(e.target.value)} />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary sm" type="button" disabled={!pasted.trim()} onClick={usePasted}>Usa questa risposta</button>
              </div>
            </div>
          )}
        </>
      )}
      {error && <div className="notice err" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  )
}
