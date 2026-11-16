import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, setSetting, uid, type Chat } from '../lib/db'
import { availableProviders, getRouting, runTask } from '../lib/ai'
import { buildAbletonClipboard, buildAbletonSystem, DEFAULT_SETUP, QUICK_PROMPTS, type AbletonSetup } from '../lib/music/ableton'
import { useApp } from '../components/AppState'
import Markdown from '../components/Markdown'

/* ======================= elenco conversazioni ======================= */

export function AbletonHome() {
  const { activeProject } = useApp()
  const nav = useNavigate()
  const chats = useLiveQuery(() => (activeProject ? db.chats.where('projectId').equals(activeProject.id).reverse().sortBy('updatedAt') : []), [activeProject?.id])

  async function create() {
    if (!activeProject) return
    const id = uid(), now = Date.now()
    await db.chats.add({ id, projectId: activeProject.id, title: 'Nuova conversazione', messages: [], createdAt: now, updatedAt: now })
    nav(`/music/assistant/${id}`)
  }

  return (
    <div className="page">
      <div className="label"><Link to="/music">01 / Music Lab</Link> / Ableton Assistant</div>
      <h1 className="display">Ableton<br /><span className="y">Assistant</span></h1>
      <p className="dim">Istruzioni operative su Ableton Live: effetti, routing, automazioni, synth, tecniche di produzione. Può usare i dati misurati di un tuo brano.</p>
      <SetupCard />
      {!activeProject ? (
        <div className="notice section">Serve un progetto attivo. <Link to="/projects" className="y">Scegline uno →</Link></div>
      ) : (
        <section className="section">
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn primary" onClick={create}>Nuova conversazione</button>
          </div>
          {chats?.length === 0 && <div className="empty">Nessuna conversazione in questo progetto.</div>}
          {chats?.map((c) => (
            <Link key={c.id} to={`/music/assistant/${c.id}`} className="list-item chat-link">
              <div className="grow"><b>{c.title}</b><div className="label">{c.messages.length} messaggi · {new Date(c.updatedAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</div></div>
              <span className="y">→</span>
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}

function SetupCard() {
  const [s, setS] = useState<AbletonSetup | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => { getSetting<AbletonSetup | null>('ableton', null).then((v) => { setS(v ?? DEFAULT_SETUP); if (!v) setOpen(true) }) }, [])
  if (!s) return null
  const save = (patch: Partial<AbletonSetup>) => { const n = { ...s, ...patch }; setS(n); setSetting('ableton', n) }
  return (
    <div className="card section">
      <div className="row" style={{ cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
        <span className="label">Il tuo setup</span>
        <span className="mono" style={{ fontSize: 13 }}>Live {s.version} · {s.edition} · {s.os}</span>
        <div className="spacer" /><span className="mono dim">{open ? '−' : 'modifica'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <p className="dim" style={{ fontSize: 13, marginTop: 0 }}>Serve per non proporti dispositivi che non hai. L'edizione la trovi in Ableton nel menu Help → About Live (su Mac: Live → About Live).</p>
          <div className="row" style={{ alignItems: 'stretch' }}>
            <select className="select" style={{ width: 'auto' }} value={s.version} onChange={(e) => save({ version: e.target.value as AbletonSetup['version'] })}>
              {['12', '11', '10', 'altro'].map((v) => <option key={v} value={v}>Live {v}</option>)}
            </select>
            <select className="select" style={{ width: 'auto' }} value={s.edition} onChange={(e) => save({ edition: e.target.value as AbletonSetup['edition'] })}>
              {['Suite', 'Standard', 'Intro', 'Lite', 'non so'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select className="select" style={{ width: 'auto' }} value={s.os} onChange={(e) => save({ os: e.target.value as AbletonSetup['os'] })}>
              {['macOS', 'Windows'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <input className="input" style={{ marginTop: 10 }} placeholder="Plugin, controller, hardware (es. Serum, Valhalla, Push 2) — opzionale" defaultValue={s.extras} onBlur={(e) => save({ extras: e.target.value })} />
        </div>
      )}
    </div>
  )
}

/* ======================= conversazione ======================= */

export function AbletonChat() {
  const { chatId } = useParams()
  const { toast } = useApp()
  const nav = useNavigate()
  const chat = useLiveQuery(() => (chatId ? db.chats.get(chatId) : undefined), [chatId])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [manual, setManual] = useState(false)
  const [pasted, setPasted] = useState('')
  const [model, setModel] = useState('')
  const abort = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const hasKey = useLiveQuery(async () => (await availableProviders()).length > 0, [])
  const project = useLiveQuery(() => (chat ? db.projects.get(chat.projectId) : undefined), [chat?.projectId])
  const options = useLiveQuery(async () => {
    if (!chat) return []
    const tracks = (await db.tracks.where('projectId').equals(chat.projectId).toArray()).filter((t) => t.kind !== 'reference')
    const out: { id: string; label: string }[] = []
    for (const t of tracks) {
      const vs = await db.versions.where('trackId').equals(t.id).sortBy('createdAt')
      vs.filter((v) => v.analysis).forEach((v) => out.push({ id: v.id, label: `${t.title} — ${v.label}` }))
    }
    return out
  }, [chat?.projectId])

  useEffect(() => { getRouting().then((r) => setModel(r.technical?.model ?? '')) }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [chat?.messages.length, busy])

  if (chat === undefined) return <div className="page"><div className="row dim"><div className="spinner" /> Caricamento…</div></div>
  if (!chat) return <div className="page"><div className="notice err">Conversazione non trovata.</div></div>

  async function system(c: Chat) {
    const setup = await getSetting<AbletonSetup>('ableton', DEFAULT_SETUP)
    const version = c.versionId ? await db.versions.get(c.versionId) : undefined
    const track = version ? await db.tracks.get(version.trackId) : undefined
    return buildAbletonSystem({ setup, project, track, version })
  }

  async function addMessage(role: 'user' | 'assistant', content: string, m?: string) {
    const c = (await db.chats.get(chat!.id))!
    const messages = [...c.messages, { role, content, model: m, at: Date.now() }]
    const title = c.messages.length === 0 && role === 'user' ? content.slice(0, 60) + (content.length > 60 ? '…' : '') : c.title
    await db.chats.update(c.id, { messages, title, updatedAt: Date.now() })
    return { ...c, messages, title }
  }

  async function ask(c: Chat) {
    setBusy(true); setError('')
    abort.current = new AbortController()
    try {
      const r = await runTask('technical', {
        system: await system(c),
        messages: c.messages.map((m) => ({ role: m.role, content: m.content })),
        maxTokens: 6000, signal: abort.current.signal,
      })
      await addMessage('assistant', r.text.trim(), r.model)
    } catch (e) {
      setError((e as Error).message)
    } finally { setBusy(false) }
  }

  async function send(content: string) {
    const t = content.trim()
    if (!t || busy) return
    setText('')
    const c = await addMessage('user', t)
    if (hasKey && !manual) await ask(c)
  }

  async function copyManual() {
    const c = (await db.chats.get(chat!.id))!
    const txt = buildAbletonClipboard(await system(c), c.messages)
    try { await navigator.clipboard.writeText(txt); toast('Copiato: incollalo in una chat di Claude') }
    catch { setError('Il browser ha bloccato la copia negli appunti.') }
  }

  async function savePasted() {
    if (!pasted.trim()) return
    await addMessage('assistant', pasted.trim(), 'claude (incollata)')
    setPasted('')
  }

  const last = chat.messages[chat.messages.length - 1]
  const waitingReply = last?.role === 'user'
  const isManual = manual || hasKey === false

  return (
    <div className="page chat-page">
      <div className="label"><Link to="/music">01 / Music Lab</Link> / <Link to="/music/assistant">Ableton Assistant</Link></div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <h1 className="display" style={{ fontSize: 'clamp(1.4rem, 5vw, 2.4rem)', flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{chat.title}</h1>
        <button className="btn danger sm" onClick={async () => { if (confirm('Eliminare questa conversazione?')) { await db.chats.delete(chat.id); nav('/music/assistant') } }}>Elimina</button>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <span className="label">Brano collegato</span>
        <select className="select" style={{ width: 'auto', flex: '1 1 200px', fontSize: 14 }} value={chat.versionId ?? ''} onChange={(e) => db.chats.update(chat.id, { versionId: e.target.value || undefined })}>
          <option value="">Nessuno (domande generali)</option>
          {options?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      <div className="chat-log section">
        {chat.messages.length === 0 && (
          <div>
            <p className="dim">Chiedi qualsiasi cosa su Ableton. Alcuni esempi:</p>
            <div className="chips">{QUICK_PROMPTS.map((q) => <button key={q} className="chip" onClick={() => send(q)}>{q}</button>)}</div>
          </div>
        )}
        {chat.messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="label">{m.role === 'user' ? 'Tu' : `Assistant${m.model ? ` · ${m.model}` : ''}`}</div>
            {m.role === 'user' ? <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div> : <Markdown text={m.content} />}
          </div>
        ))}
        {busy && <div className="msg assistant"><div className="row"><div className="spinner" /><span className="dim">Sto scrivendo le istruzioni…</span><div className="spacer" /><button className="btn ghost sm" onClick={() => abort.current?.abort()}>Annulla</button></div></div>}
        {error && <div className="notice err">{error}{waitingReply && hasKey && !manual && <> <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => ask(chat)}>Riprova</button></>}</div>}
        {isManual && waitingReply && !busy && (
          <div className="manual card">
            <div className="label y">Rispondi con il tuo abbonamento Claude</div>
            <ol className="steps">
              <li><button className="btn sm" onClick={copyManual}>Copia domanda + contesto</button></li>
              <li>Incollala in una chat di Claude e invia.</li>
              <li>Incolla qui la risposta.</li>
            </ol>
            <textarea className="textarea" rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Incolla qui la risposta di Claude" />
            <button className="btn primary sm" style={{ marginTop: 8 }} disabled={!pasted.trim()} onClick={savePasted}>Aggiungi alla conversazione</button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text) }}>
        <textarea className="textarea" rows={2} value={text} placeholder="Scrivi la tua domanda…" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(text) } }} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" disabled={!text.trim() || busy}>Invia</button>
          {hasKey && <label className="row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} style={{ accentColor: 'var(--y)' }} />Usa Claude (copia/incolla)</label>}
          <div className="spacer" />
          <span className="label">{isManual ? 'modalità manuale' : model}</span>
        </div>
      </form>
    </div>
  )
}
