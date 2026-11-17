import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newProject, saveProject, type ProjectType } from '../lib/db'
import { useApp } from '../components/AppState'

export const TYPE_LABEL: Record<ProjectType, string> = {
  singolo: 'Singolo', ep: 'EP', album: 'Album', videoclip: 'Videoclip', campagna: 'Campagna', altro: 'Altro',
}

/** Schede del Project Manager: progetti, timeline unica, ricerca. */
export function PmTabs() {
  return (
    <nav className="pm-tabs" aria-label="Project manager">
      <NavLink to="/projects" end>Progetti</NavLink>
      <NavLink to="/timeline">Timeline</NavLink>
      <NavLink to="/search">Cerca</NavLink>
    </nav>
  )
}

export default function ProjectsPage() {
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), [])
  const { activeProject, setActiveProjectId, toast } = useApp()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [type, setType] = useState<ProjectType>('singolo')
  const [busy, setBusy] = useState(false)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const p = newProject({ name: name.trim(), type })
      await saveProject(p)
      setActiveProjectId(p.id)
      setName('')
      toast('Progetto creato')
      nav(`/projects/${p.id}`)
    } catch (err) {
      toast(`Errore nel salvataggio: ${(err as Error).message}`, 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="label">00 / Project manager</div>
      <h1 className="display">Progetti</h1>
      <PmTabs />

      <form className="card section" onSubmit={create}>
        <div className="label" style={{ marginBottom: 12 }}>Nuovo progetto</div>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <input className="input" style={{ flex: '2 1 220px' }} placeholder="Nome (es. Ambra)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <select className="select" style={{ flex: '1 1 140px' }} value={type} onChange={(e) => setType(e.target.value as ProjectType)}>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn primary" disabled={!name.trim() || busy}>Crea</button>
        </div>
      </form>

      <div className="section">
        {projects === undefined ? (
          <div className="row dim"><div className="spinner" /> Caricamento…</div>
        ) : projects.length === 0 ? (
          <div className="empty">Nessun progetto ancora. Creane uno qui sopra.</div>
        ) : (
          <div className="grid cols-2">
            {projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="card hover">
                <div className="row">
                  <span className="tag">{TYPE_LABEL[p.type]}</span>
                  <span className="tag y">{p.status}</span>
                  <div className="spacer" />
                  {activeProject?.id === p.id && <span className="tag solid">Attivo</span>}
                </div>
                <h2 className="display" style={{ marginTop: 14 }}>{p.name}</h2>
                {p.description && <p className="dim" style={{ margin: '8px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
                <div className="label" style={{ marginTop: 14 }}>
                  {p.decisions.length} decisioni · {p.discarded.length} scartate · {(p.notes ?? []).length} note
                </div>
                <NextDeadline goals={p.goals} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NextDeadline({ goals }: { goals: { deadline?: string; done: boolean; text: string }[] }) {
  const t = new Date().toISOString().slice(0, 10)
  const open = goals.filter((g) => !g.done && g.deadline).sort((a, b) => a.deadline!.localeCompare(b.deadline!))
  const late = open.filter((g) => g.deadline! < t).length
  const next = open.find((g) => g.deadline! >= t)
  if (!late && !next) return null
  return (
    <div className="label" style={{ marginTop: 6 }}>
      {late > 0 && <span style={{ color: 'var(--red)' }}>{late} obiettivi scaduti{next ? ' · ' : ''}</span>}
      {next && <span className="y">Prossimo: {next.text} ({next.deadline})</span>}
    </div>
  )
}
