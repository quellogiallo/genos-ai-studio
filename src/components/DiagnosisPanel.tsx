import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type Diagnosis, type Project, type Track, type TrackVersion } from '../lib/db'
import { getRouting, runTask, type TaskRouting } from '../lib/ai'
import { buildClipboardPrompt, buildDiagnosisPrompt, buildListenPrompt, LISTEN_MAX_SECONDS, prepareListeningAudio } from '../lib/music/diagnosis'
import { useApp } from './AppState'
import Markdown from './Markdown'

type Busy = null | { kind: 'diagnosi' | 'ascolto'; stage: string }

export default function DiagnosisPanel({ track, version, previous }: { track: Track; version: TrackVersion; previous?: TrackVersion }) {
  const { toast } = useApp()
  const [project, setProject] = useState<Project>()
  const [routes, setRoutes] = useState<Partial<Record<string, TaskRouting>>>({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string>()
  const [manual, setManual] = useState<{ open: boolean; copied: boolean; prompt?: string; answer: string }>({ open: false, copied: false, answer: '' })
  const abortRef = useRef<AbortController | null>(null)

  const history = useLiveQuery(() => db.diagnoses.where('versionId').equals(version.id).reverse().sortBy('createdAt'), [version.id])

  useEffect(() => { db.projects.get(track.projectId).then(setProject) }, [track.projectId])
  useEffect(() => { getRouting().then(setRoutes) }, [])

  const input = { project, track, version, previous, userNote: note }
  const critical = routes.critical, listen = routes.listen

  async function save(d: Omit<Diagnosis, 'id' | 'createdAt' | 'versionId' | 'userNote'>) {
    await db.diagnoses.add({ ...d, id: uid(), versionId: version.id, userNote: note.trim(), createdAt: Date.now() })
  }

  async function runAuto(kind: 'diagnosi' | 'ascolto') {
    setError(undefined)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      let audio: { mime: string; base64: string } | undefined
      if (kind === 'ascolto') {
        setBusy({ kind, stage: 'Preparo l\'audio per l\'ascolto' })
        const f = await db.audioFiles.get(version.id)
        if (!f) throw new Error('File audio non trovato.')
        const prep = await prepareListeningAudio(f.blob)
        if (prep.trimmed) toast(`Il brano supera ${LISTEN_MAX_SECONDS / 60} minuti: verranno ascoltati solo i primi ${LISTEN_MAX_SECONDS / 60}.`)
        audio = prep
      }
      const route = kind === 'ascolto' ? listen : critical
      setBusy({ kind, stage: `${route?.model ?? 'AI'} sta ${kind === 'ascolto' ? 'ascoltando' : 'analizzando i dati'}…` })
      const { system, user } = kind === 'ascolto' ? buildListenPrompt(input) : buildDiagnosisPrompt(input)
      const r = await runTask(kind === 'ascolto' ? 'listen' : 'critical', {
        system, messages: [{ role: 'user', content: user }], maxTokens: 8192, audio, signal: ctrl.signal,
      })
      await save({ kind, source: 'auto', provider: r.provider, model: r.model, markdown: r.text.trim() })
      toast(kind === 'ascolto' ? 'Ascolto completato' : 'Diagnosi completata')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null); abortRef.current = null
    }
  }

  async function copyForClaude() {
    const prompt = buildClipboardPrompt(input)
    let copied = false
    try { await navigator.clipboard.writeText(prompt); copied = true } catch { /* copia manuale sotto */ }
    setManual({ open: true, copied, prompt, answer: manual.answer })
    if (copied) toast('Copiato: incollalo in una chat di Claude')
  }

  async function saveManual() {
    if (!manual.answer.trim()) return
    await save({ kind: 'diagnosi', source: 'manuale', provider: 'claude (abbonamento)', markdown: manual.answer.trim() })
    setManual({ open: false, copied: false, answer: '' })
    toast('Risposta salvata')
  }

  return (
    <div>
      <section className="section">
        <div className="section-head"><span className="num">AI</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Diagnosi</h2><div className="spacer" /><span className="tag">basata sui dati</span></div>
        <p className="dim" style={{ marginTop: -6, fontSize: 13 }}>
          L'AI riceve i dati misurati, il contesto del progetto{project ? ` "${project.name}"` : ''} (decisioni e idee scartate incluse){previous?.analysis ? ` e il confronto con "${previous.label}"` : ''}.
          Risponde nel formato Diagnosi → Problema → Causa → Intervento → Alternative creative.
        </p>
        <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Opzionale: genere/reference, dove uscirà (streaming, club…), cosa ti preoccupa. Es. «la cassa mi sembra persa nel ritornello»" />

        <div className="ai-actions">
          <div className="ai-action">
            <b>Diagnosi automatica</b>
            <span className="label">{critical ? `${critical.provider === 'google' ? 'Gemini' : 'Claude API'} · ${critical.model}` : 'nessuna chiave API'}</span>
            <button className="btn primary sm" disabled={!!busy || !critical} onClick={() => runAuto('diagnosi')}>Avvia</button>
          </div>
          <div className="ai-action">
            <b>Ascolto AI</b>
            <span className="label">{listen ? `Gemini · ${listen.model} · strumenti e arrangiamento` : 'richiede chiave Gemini'}</span>
            <button className="btn sm" disabled={!!busy || !listen} onClick={() => runAuto('ascolto')}>Ascolta</button>
          </div>
          <div className="ai-action">
            <b>Copia per Claude</b>
            <span className="label">usa il tuo abbonamento, nessuna API</span>
            <button className="btn sm" disabled={!!busy || !project} onClick={copyForClaude}>Copia</button>
          </div>
        </div>
        {!critical && !listen && <div className="notice" style={{ marginTop: 12 }}>Per la diagnosi automatica aggiungi una chiave in <a className="y" href="#/settings">Setup</a> (Gemini è gratuito). Senza chiavi puoi usare “Copia per Claude”.</div>}

        {busy && (
          <div className="notice" style={{ marginTop: 12 }}>
            <div className="row"><div className="spinner" /><b>{busy.stage}</b><div className="spacer" />
              <button className="btn ghost sm" onClick={() => abortRef.current?.abort()}>Annulla</button></div>
            <div className="label" style={{ marginTop: 6 }}>Può richiedere fino a un minuto.</div>
          </div>
        )}
        {error && <div className="notice err" style={{ marginTop: 12 }}>{error}</div>}

        {manual.open && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="label" style={{ marginBottom: 8 }}>Copia per Claude</div>
            <ol className="steps">
              <li>{manual.copied ? 'Il testo è già copiato.' : 'Copia il testo qui sotto (tieni premuto → Seleziona tutto → Copia).'}</li>
              <li>Apri <a className="y" href="https://claude.ai/new" target="_blank" rel="noreferrer">una nuova chat di Claude</a> (meglio dentro il progetto GENOS AI STUDIO) e incolla.</li>
              <li>Copia la risposta di Claude e incollala qui sotto per salvarla con questa versione.</li>
            </ol>
            {!manual.copied && <textarea className="textarea mono" style={{ fontSize: 12 }} rows={6} readOnly value={manual.prompt} onFocus={(e) => e.currentTarget.select()} />}
            <textarea className="textarea" rows={6} style={{ marginTop: 10 }} placeholder="Incolla qui la risposta di Claude" value={manual.answer} onChange={(e) => setManual({ ...manual, answer: e.target.value })} />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary sm" disabled={!manual.answer.trim()} onClick={saveManual}>Salva risposta</button>
              <button className="btn ghost sm" onClick={() => setManual({ open: false, copied: false, answer: '' })}>Chiudi</button>
            </div>
          </div>
        )}
      </section>

      <section className="section">
        {history === undefined ? null : history.length === 0 ? (
          <div className="empty">Nessuna diagnosi salvata per questa versione.</div>
        ) : history.map((d) => <DiagnosisCard key={d.id} d={d} />)}
      </section>
    </div>
  )
}

function DiagnosisCard({ d }: { d: Diagnosis }) {
  const { toast } = useApp()
  const [open, setOpen] = useState(true)
  return (
    <article className="diag">
      <header className="row diag-head" onClick={() => setOpen((o) => !o)}>
        <span className={`tag ${d.kind === 'ascolto' ? 'y' : 'solid'}`}>{d.kind === 'ascolto' ? 'Ascolto AI' : 'Diagnosi'}</span>
        <span className="label">{d.source === 'manuale' ? 'Claude (incollata)' : d.model} · {new Date(d.createdAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</span>
        <div className="spacer" />
        <span className="mono dim">{open ? '−' : '+'}</span>
      </header>
      {open && <>
        {d.userNote && <div className="label" style={{ margin: '10px 0' }}>Richiesta: {d.userNote}</div>}
        {d.kind === 'ascolto' && <div className="notice" style={{ margin: '10px 0', fontSize: 13 }}>Percezione del modello, non misura: verifica sempre a orecchio. I numeri affidabili sono quelli del report.</div>}
        <Markdown text={d.markdown} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(d.markdown); toast('Testo copiato') } catch { toast('Copia non riuscita', 'err') } }}>Copia testo</button>
          <button className="btn danger sm" onClick={() => confirm('Eliminare questa diagnosi?') && db.diagnoses.delete(d.id)}>Elimina</button>
        </div>
      </>}
    </article>
  )
}
