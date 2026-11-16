import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from '../lib/db'
import { useApp } from '../components/AppState'
import { fmtTime } from '../components/AnalysisReport'

export default function MusicLabPage() {
  const { activeProject, toast } = useApp()
  const nav = useNavigate()
  const [title, setTitle] = useState('')

  const tracks = useLiveQuery(async () => {
    if (!activeProject) return []
    const ts = await db.tracks.where('projectId').equals(activeProject.id).toArray()
    ts.sort((a, b) => b.updatedAt - a.updatedAt)
    return Promise.all(ts.map(async (t) => {
      const vs = await db.versions.where('trackId').equals(t.id).sortBy('createdAt')
      return { t, count: vs.length, last: vs[vs.length - 1] }
    }))
  }, [activeProject?.id])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject || !title.trim()) return
    const now = Date.now()
    const id = uid()
    await db.tracks.add({ id, projectId: activeProject.id, title: title.trim(), notes: '', createdAt: now, updatedAt: now })
    setTitle('')
    toast('Brano creato')
    nav(`/music/${id}`)
  }

  return (
    <div className="page">
      <div className="label">01 / Music Lab</div>
      <h1 className="display">Music Lab</h1>

      {!activeProject ? (
        <div className="notice section">
          Il Music Lab lavora dentro un progetto. <Link to="/projects" className="y">Crea o scegli un progetto attivo →</Link>
        </div>
      ) : (
        <>
          <p className="dim">Brani del progetto <b className="y">{activeProject.name}</b>. Ogni brano può avere più versioni (demo, mix, master) da analizzare e confrontare.</p>
          <form className="card section" onSubmit={create}>
            <div className="label" style={{ marginBottom: 12 }}>Nuovo brano</div>
            <div className="row" style={{ alignItems: 'stretch' }}>
              <input className="input" style={{ flex: '2 1 220px' }} placeholder="Titolo del brano" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
              <button className="btn primary" disabled={!title.trim()}>Crea brano</button>
            </div>
          </form>

          <div className="section">
            {tracks === undefined ? (
              <div className="row dim"><div className="spinner" /> Caricamento…</div>
            ) : tracks.length === 0 ? (
              <div className="empty">Nessun brano in questo progetto. Creane uno e carica il primo file audio.</div>
            ) : (
              <div className="grid cols-2">
                {tracks.map(({ t, count, last }) => (
                  <Link key={t.id} to={`/music/${t.id}`} className="card hover">
                    <div className="row"><span className="tag">{count} {count === 1 ? 'versione' : 'versioni'}</span></div>
                    <h2 className="display" style={{ marginTop: 14 }}>{t.title}</h2>
                    {last?.analysis ? (
                      <div className="label" style={{ marginTop: 12 }}>
                        Ultima: {last.label} · {last.analysis.integratedLufs.toFixed(1)} LUFS · {last.analysis.truePeakDb.toFixed(1)} dBTP · {fmtTime(last.analysis.duration)}
                      </div>
                    ) : <div className="label" style={{ marginTop: 12 }}>Nessuna analisi ancora</div>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <section className="section">
        <div className="section-head"><span className="num">//</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Prossime fasi</h2></div>
        {[
          ['F4', 'Ableton Assistant, testi e metrica, concept beat, reference'],
        ].map(([id, t]) => <div key={id} className="list-item"><span className="tag">{id}</span><div className="grow dim">{t}</div></div>)}
      </section>
    </div>
  )
}
