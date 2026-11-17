import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting } from '../lib/db'
import { useApp } from '../components/AppState'
import { MODULES } from '../components/Layout'
import { collectEvents, daysFrom, fmtDay, KIND_LABEL, projectColors, relLabel, today } from '../lib/pm/timeline'

export default function HomePage() {
  const { activeProject } = useApp()
  const count = useLiveQuery(() => db.projects.count(), [])
  const hasKey = useLiveQuery(async () => Object.values(await getSetting<Record<string, string>>('apiKeys', {})).some(Boolean), [])

  return (
    <>
      <div className="marquee" aria-hidden>
        <span>{'MUSIC · VIDEO · CONTENT · ART DIRECTION · PROJECT MEMORY · '.repeat(8)}</span>
      </div>
      <div className="page">
        <div className="label">Creative direction system</div>
        <h1 className="display">Genos<br /><span className="y">AI</span> Studio</h1>

        {hasKey === false && (
          <div className="notice section">
            Nessuna chiave AI configurata. Progetti e analisi audio funzionano già; per la diagnosi automatica aggiungi una chiave (Gemini è gratuito) oppure usa “Copia per Claude”.{' '}
            <Link to="/settings" className="y">Vai al setup →</Link>
          </div>
        )}

        <div className="grid cols-3 section">
          <Link to={activeProject ? `/projects/${activeProject.id}` : '/projects'} className="card hover">
            <div className="label">Progetto attivo</div>
            <h2 className="display" style={{ marginTop: 10 }}>{activeProject?.name ?? '—'}</h2>
            <div className="label" style={{ marginTop: 10 }}>{count ?? 0} progetti totali</div>
          </Link>
          {MODULES.filter((m) => m.to !== '/projects').map((m) => (
            <Link key={m.to} to={m.to} className="card hover">
              <div className="row"><span className="label">{m.idx}</span><div className="spacer" />{!m.ready && <span className="tag">Soon</span>}</div>
              <h2 className="display" style={{ marginTop: 10 }}>{m.label}</h2>
            </Link>
          ))}
        </div>

        <UpcomingStrip />
      </div>
    </>
  )
}

/** Prossime scadenze di tutti i progetti non archiviati (timeline unica). */
function UpcomingStrip() {
  const data = useLiveQuery(async () => {
    const projects = (await db.projects.toArray()).filter((p) => p.status !== 'archiviato')
    return { projects, events: collectEvents(projects, await db.campaigns.toArray()) }
  }, [])
  if (!data) return null
  const t = today()
  const late = data.events.filter((e) => !e.done && e.date < t).length
  const next = data.events.filter((e) => !e.done && e.date >= t).slice(0, 6)
  if (!late && !next.length) return null
  const colors = projectColors(data.projects)
  const names = Object.fromEntries(data.projects.map((p) => [p.id, p.name]))
  return (
    <section className="section">
      <div className="row">
        <div className="label">Prossime scadenze</div>
        <div className="spacer" />
        <Link to="/timeline" className="label y">Timeline →</Link>
      </div>
      {late > 0 && <Link to="/timeline" className="notice err" style={{ display: 'block', marginTop: 10, textDecoration: 'none', color: 'var(--fg)' }}>{late} {late === 1 ? 'scadenza' : 'scadenze'} in ritardo</Link>}
      <div style={{ marginTop: 10 }}>
        {next.map((e) => (
          <Link key={e.id} to="/timeline" className="pm-row" style={{ borderLeftColor: colors[e.projectId], textDecoration: 'none', color: 'var(--fg)' }}>
            <div className="pm-row-date"><span>{fmtDay(e.date)}</span><span className="label">{relLabel(daysFrom(e.date))}</span></div>
            <div className="grow"><b>{e.title}</b><div className="label">{names[e.projectId]} · {KIND_LABEL[e.kind]}</div></div>
          </Link>
        ))}
      </div>
    </section>
  )
}
