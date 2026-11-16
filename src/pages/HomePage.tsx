import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting } from '../lib/db'
import { useApp } from '../components/AppState'
import { MODULES } from '../components/Layout'

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
      </div>
    </>
  )
}
