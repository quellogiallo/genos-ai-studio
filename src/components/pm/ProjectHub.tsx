import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, saveProject, uid, type Project, type QuickNote } from '../../lib/db'
import { buildFullContext, projectOverview, reviewPrompt } from '../../lib/pm/overview'
import { daysFrom, fmtDay, KIND_LABEL, relLabel, type EventKind } from '../../lib/pm/timeline'
import AiRunner from '../AiRunner'
import AiNotesList from '../AiNotesList'
import { useApp } from '../AppState'
import { Steps, useOpenIn } from './common'

/* ---------------- panoramica: stato dei moduli + prossime scadenze ---------------- */

export function OverviewPanel({ project }: { project: Project }) {
  // si ricalcola quando cambiano i dati dei moduli
  const ov = useLiveQuery(() => projectOverview(project), [project])
  const open = useOpenIn()
  if (!ov) return <div className="row dim"><div className="spinner" /> Calcolo…</div>

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {ov.modules.map((m) => (
          <div key={m.area} className="card pm-mod">
            <div className="row">
              <span className="label">{m.label}</span>
              <div className="spacer" />
              <button className="btn ghost sm" onClick={() => open(project.id, m.link)}>Apri →</button>
            </div>
            {m.items.length === 0 ? <p className="dim" style={{ margin: '8px 0 0', fontSize: 13 }}>{m.empty}</p> : m.items.map((i) => (
              <div key={i.link + i.title} style={{ marginTop: 10 }}>
                <button className="pm-link" onClick={() => open(project.id, i.link)}>{i.title}</button>
                {i.extra && <span className="label"> · {i.extra}</span>}
                <Steps steps={i.steps} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="row section" style={{ marginTop: 16, alignItems: 'flex-start' }}>
        <div className="grow" style={{ flex: '1 1 260px' }}>
          <div className="label" style={{ marginBottom: 6 }}>Prossime scadenze</div>
          {ov.next.length === 0 ? <p className="dim" style={{ margin: 0, fontSize: 13 }}>Nessuna data in arrivo (obiettivi con scadenza, uscite o post del calendario).</p>
            : ov.next.map((e) => (
              <div key={e.date + e.title} className="pm-ev">
                <span className="label">{fmtDay(e.date)} · {relLabel(daysFrom(e.date))}</span>
                <span className={`tag ${e.kind === 'uscita' ? 'solid' : 'y'}`}>{KIND_LABEL[e.kind as EventKind]}</span>
                <button className="pm-link" onClick={() => open(project.id, e.link)}>{e.title}</button>
              </div>
            ))}
          <Link to={`/timeline?p=${project.id}`} className="label y" style={{ display: 'inline-block', marginTop: 8 }}>Timeline completa →</Link>
        </div>
        <div className="card" style={{ flex: '0 1 220px' }}>
          <div className="label">Obiettivi</div>
          <div className="display" style={{ fontSize: '2rem', marginTop: 6 }}>{ov.goals.done}/{ov.goals.total}</div>
          {ov.goals.overdue > 0 && <div className="label" style={{ color: 'var(--red)' }}>{ov.goals.overdue} scaduti</div>}
        </div>
      </div>
    </div>
  )
}

/* ---------------- note e idee veloci ---------------- */

const tagsOf = (t: string) => [...new Set([...t.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1].toLowerCase()))]

export function NotesPanel({ project }: { project: Project }) {
  const { toast } = useApp()
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const notes = project.notes ?? []

  const save = async (next: QuickNote[]) => {
    try { await saveProject({ ...project, notes: next }) } catch (e) { toast(`Errore nel salvataggio: ${(e as Error).message}`, 'err') }
  }
  const add = async () => {
    const t = text.trim(); if (!t) return
    const now = Date.now()
    await save([...notes, { id: uid(), text: t, tags: tagsOf(t), createdAt: now, updatedAt: now }])
    setText('')
  }
  const promote = async (n: QuickNote, to: 'decisione' | 'scartata') => {
    const clean = n.text.replace(/#[\p{L}\p{N}_-]+/gu, '').replace(/\s+/g, ' ').trim()
    const rest = notes.filter((x) => x.id !== n.id)
    try {
      if (to === 'decisione') await saveProject({ ...project, notes: rest, decisions: [...project.decisions, { id: uid(), text: clean, area: 'generale', createdAt: Date.now() }] })
      else await saveProject({ ...project, notes: rest, discarded: [...project.discarded, { id: uid(), text: clean, createdAt: Date.now() }] })
      toast(to === 'decisione' ? 'Diventata decisione (area: generale)' : 'Spostata tra le idee scartate')
    } catch (e) { toast(`Errore: ${(e as Error).message}`, 'err') }
  }

  const allTags = [...new Set(notes.flatMap((n) => n.tags))].sort()
  const shown = [...notes].filter((n) => !filter || n.tags.includes(filter))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt)

  return (
    <div id="note">
      <form onSubmit={(e) => { e.preventDefault(); add() }}>
        <textarea className="textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add() } }}
          placeholder="Un'idea al volo… usa #tag (es. #video #testo)" />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary sm" disabled={!text.trim()}>Salva nota</button>
          <span className="label">Le note NON sono decisioni: l'AI le legge come idee aperte.</span>
        </div>
      </form>
      {allTags.length > 0 && (
        <div className="row" style={{ marginTop: 12, gap: 6 }}>
          <button className={`tag ${filter === null ? 'solid' : ''}`} onClick={() => setFilter(null)}>Tutte ({notes.length})</button>
          {allTags.map((t) => <button key={t} className={`tag ${filter === t ? 'solid' : ''}`} onClick={() => setFilter(filter === t ? null : t)}>#{t}</button>)}
        </div>
      )}
      {shown.length === 0 && <p className="dim" style={{ fontSize: 13 }}>{notes.length ? 'Nessuna nota con questo tag.' : 'Nessuna nota.'}</p>}
      {shown.map((n) => (
        <div key={n.id} className="list-item">
          <button className={`btn ghost sm ${n.pinned ? 'y' : ''}`} title={n.pinned ? 'Togli dall\'alto' : 'Fissa in alto'}
            onClick={() => save(notes.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x)))}>{n.pinned ? '▲' : '△'}</button>
          <div className="grow">
            {editing === n.id ? (
              <>
                <textarea className="textarea" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="btn primary sm" disabled={!draft.trim()} onClick={async () => { await save(notes.map((x) => (x.id === n.id ? { ...x, text: draft.trim(), tags: tagsOf(draft), updatedAt: Date.now() } : x))); setEditing(null) }}>Salva</button>
                  <button className="btn ghost sm" onClick={() => setEditing(null)}>Annulla</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
                <div className="row" style={{ marginTop: 6, gap: 6 }}>
                  <span className="label">{new Date(n.createdAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <div className="spacer" />
                  <button className="tag" onClick={() => { setEditing(n.id); setDraft(n.text) }}>Modifica</button>
                  <button className="tag y" onClick={() => promote(n, 'decisione')}>→ Decisione</button>
                  <button className="tag" onClick={() => promote(n, 'scartata')}>→ Scartata</button>
                </div>
              </>
            )}
          </div>
          <button className="btn ghost sm" onClick={() => { if (confirm('Eliminare la nota?')) save(notes.filter((x) => x.id !== n.id)) }}>×</button>
        </div>
      ))}
    </div>
  )
}

/* ---------------- revisione AI dell'intero progetto ---------------- */

export function ReviewPanel({ project }: { project: Project }) {
  const [focus, setFocus] = useState('')
  return (
    <div>
      <p className="dim" style={{ marginTop: 0, fontSize: 13 }}>
        L'AI riceve lo stato dei moduli calcolato dall'app, decisioni, idee scartate, note, scadenze e un riassunto di musica, video, contenuti e identità visiva.
        Cerca incoerenze tra i moduli, cosa manca e i rischi sulle date. Non vede i file audio né le immagini.
      </p>
      <input className="input" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Facoltativo: cosa vuoi capire (es. siamo pronti per l'uscita del 12?)" />
      <div style={{ marginTop: 10 }}>
        <AiRunner label="Revisione del progetto"
          build={async () => {
            const fresh = (await db.projects.get(project.id)) ?? project
            const ov = await projectOverview(fresh)
            return reviewPrompt(await buildFullContext(fresh, ov), focus.trim())
          }}
          onResult={async (t) => {
            if (!t.trim()) throw new Error('Risposta vuota.')
            await db.aiNotes.add({ id: uid(), scope: 'project', refId: project.id, kind: 'progetto-revisione', userNote: focus.trim() || 'Revisione del progetto', markdown: t.trim(), createdAt: Date.now() })
          }} />
      </div>
      <AiNotesList refId={project.id} kinds={['progetto-revisione']} />
    </div>
  )
}
