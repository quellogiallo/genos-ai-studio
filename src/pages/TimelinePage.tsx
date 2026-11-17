import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, saveProject } from '../lib/db'
import { useApp } from '../components/AppState'
import { Dot, useOpenIn } from '../components/pm/common'
import { PmTabs } from './ProjectsPage'
import {
  collectEvents, daysFrom, findClashes, fmtDay, KIND_LABEL, projectColors, relLabel, timelineIcs, today, weekStart,
  type EventKind, type TimelineEvent,
} from '../lib/pm/timeline'

const KINDS: EventKind[] = ['uscita', 'obiettivo', 'post']

export default function TimelinePage() {
  const [params, setParams] = useSearchParams()
  const { toast } = useApp()
  const open = useOpenIn()
  const projects = useLiveQuery(() => db.projects.toArray(), [])
  const campaigns = useLiveQuery(() => db.campaigns.toArray(), [])
  const [kinds, setKinds] = useState<EventKind[]>(KINDS)
  const [showDone, setShowDone] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const only = params.get('p')
  const colors = useMemo(() => projectColors(projects ?? []), [projects])
  const names = useMemo(() => Object.fromEntries((projects ?? []).map((p) => [p.id, p.name])), [projects])
  const visibleProjects = (projects ?? []).filter((p) => showArchived || p.status !== 'archiviato')
  const selected = only ? visibleProjects.filter((p) => p.id === only) : visibleProjects

  const all = useMemo(() => collectEvents(selected, campaigns ?? []), [selected, campaigns])
  if (!projects || !campaigns) return <div className="page"><div className="row dim"><div className="spinner" /> Caricamento…</div></div>

  const t = today()
  const filtered = all.filter((e) => kinds.includes(e.kind))
  const late = filtered.filter((e) => !e.done && e.date < t)
  const upcoming = filtered.filter((e) => e.date >= t && (showDone || !e.done))
  const clashes = new Map(findClashes(filtered).map((c) => [c.date, c]))
  const weeks = new Map<string, TimelineEvent[]>()
  for (const e of upcoming) { const w = weekStart(e.date); weeks.set(w, [...(weeks.get(w) ?? []), e]) }

  const toggleGoal = async (e: TimelineEvent) => {
    const p = projects.find((x) => x.id === e.projectId); if (!p || !e.goalId) return
    try { await saveProject({ ...p, goals: p.goals.map((g) => (g.id === e.goalId ? { ...g, done: !g.done } : g)) }) }
    catch (err) { toast(`Errore: ${(err as Error).message}`, 'err') }
  }

  const exportIcs = () => {
    const ev = filtered.filter((e) => !e.done && e.date >= t)
    if (!ev.length) { toast('Nessuna scadenza futura da esportare', 'err'); return }
    const blob = new Blob([timelineIcs(ev, names)], { type: 'text/calendar' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `genos-timeline-${t}.ics`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    toast(`${ev.length} eventi esportati`)
  }

  const row = (e: TimelineEvent) => (
    <div key={e.id} className={`pm-row ${e.done ? 'done' : ''}`} style={{ borderLeftColor: colors[e.projectId] }}>
      <div className="pm-row-date">
        <span>{fmtDay(e.date)}{e.time ? ` · ${e.time}` : ''}</span>
        <span className="label">{relLabel(daysFrom(e.date))}</span>
      </div>
      <div className="grow">
        <div className="row" style={{ gap: 6 }}>
          <span className={`tag ${e.kind === 'uscita' ? 'solid' : e.kind === 'obiettivo' ? 'y' : ''}`}>{KIND_LABEL[e.kind]}</span>
          <button className="pm-link" onClick={() => open(e.projectId, e.link)}>{e.title}</button>
        </div>
        <div className="label" style={{ marginTop: 4 }}>{names[e.projectId]}{e.detail ? ` · ${e.detail}` : ''}</div>
      </div>
      {e.goalId && (
        <input type="checkbox" aria-label="Fatto" checked={e.done} onChange={() => toggleGoal(e)} style={{ accentColor: 'var(--y)', width: 20, height: 20 }} />
      )}
    </div>
  )

  return (
    <div className="page">
      <div className="label">00 / Project manager</div>
      <h1 className="display">Timeline</h1>
      <PmTabs />

      <div className="section">
        <div className="row" style={{ gap: 6 }}>
          <button className={`tag ${!only ? 'solid' : ''}`} onClick={() => setParams({})}>Tutti i progetti</button>
          {visibleProjects.map((p) => (
            <button key={p.id} className={`tag ${only === p.id ? 'solid' : ''}`} onClick={() => setParams(only === p.id ? {} : { p: p.id })}>
              <Dot color={colors[p.id]} />&nbsp;{p.name}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          {KINDS.map((k) => (
            <button key={k} className={`tag ${kinds.includes(k) ? 'y' : ''}`} onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])}>
              {kinds.includes(k) ? '■' : '□'} {KIND_LABEL[k]}
            </button>
          ))}
          <button className={`tag ${showDone ? 'y' : ''}`} onClick={() => setShowDone(!showDone)}>{showDone ? '■' : '□'} Completati</button>
          <button className={`tag ${showArchived ? 'y' : ''}`} onClick={() => setShowArchived(!showArchived)}>{showArchived ? '■' : '□'} Archiviati</button>
          <div className="spacer" />
          <button className="btn sm" onClick={exportIcs}>Esporta nel calendario (.ics)</button>
        </div>
      </div>

      {all.length === 0 && (
        <div className="empty section">
          Nessuna data ancora. La timeline mostra le scadenze degli <b>obiettivi</b> (scheda del progetto), le <b>uscite</b> e i <b>post</b> del calendario delle campagne (Content Lab).
          <div style={{ marginTop: 10 }}><Link to="/projects" className="y">Vai ai progetti →</Link></div>
        </div>
      )}

      {late.length > 0 && (
        <section className="section">
          <div className="section-head"><span className="num" style={{ background: 'var(--red)' }}>!</span><h2 className="display" style={{ fontSize: '1.2rem' }}>In ritardo ({late.length})</h2></div>
          <p className="dim" style={{ marginTop: -6, fontSize: 13 }}>Obiettivi non spuntati e post non segnati come pubblicati con data passata.</p>
          {late.map((e) => row(e))}
        </section>
      )}

      {[...weeks.entries()].map(([w, es]) => {
        const n = daysFrom(w)
        const label = n <= 0 && n > -7 ? 'Questa settimana' : n > 0 && n <= 7 ? 'Prossima settimana' : `Settimana del ${fmtDay(w)}`
        const days = [...new Set(es.map((e) => e.date))]
        return (
          <section key={w} className="section">
            <div className="label pm-week">{label} · {es.length} {es.length === 1 ? 'evento' : 'eventi'}</div>
            {days.map((d) => (
              <div key={d}>
                {clashes.has(d) && (
                  <div className="pm-clash">⚠ {fmtDay(d)}: {clashes.get(d)!.events.length} scadenze aperte di {new Set(clashes.get(d)!.events.map((e) => e.projectId)).size} progetti nello stesso giorno</div>
                )}
                {es.filter((e) => e.date === d).map((e) => row(e))}
              </div>
            ))}
          </section>
        )
      })}

      {all.length > 0 && upcoming.length === 0 && late.length === 0 && <div className="empty section">Nessuna scadenza con questi filtri.</div>}
    </div>
  )
}
