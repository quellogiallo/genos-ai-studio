import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from '../lib/db'
import { useApp } from '../components/AppState'
import { FORMAT_LABEL, TECHNIQUE_LABEL, fmtDur, type VideoFormat, type VideoProject, type VideoTechnique } from '../lib/video/types'

/** Quanti dei 5 passi attivi sono stati compilati. */
export function videoProgress(v: VideoProject): number {
  return [!!v.concept, !!v.direction, v.mood.length > 0, v.sheets.length > 0, v.scenes.length > 0].filter(Boolean).length
}

export default function VideoLabPage() {
  const { activeProject, toast } = useApp()
  const nav = useNavigate()
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState<VideoFormat>('videoclip')
  const [tech, setTech] = useState<VideoTechnique[]>(['reale'])

  const videos = useLiveQuery(async () => {
    if (!activeProject) return []
    const vs = await db.videos.where('projectId').equals(activeProject.id).toArray()
    return vs.sort((a, b) => b.updatedAt - a.updatedAt)
  }, [activeProject?.id])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProject || !title.trim() || !tech.length) return
    const now = Date.now()
    const v: VideoProject = {
      id: uid(), projectId: activeProject.id, title: title.trim(), format, techniques: tech, targetSec: 0,
      idea: '', proposals: [], mood: [], moodSearch: [], sheets: [], scenes: [], arc: '', createdAt: now, updatedAt: now,
    }
    try {
      await db.videos.add(v)
      setTitle('')
      toast('Video creato')
      nav(`/video/${v.id}`)
    } catch (err) {
      toast(`Errore nel salvataggio: ${(err as Error).message}`, 'err')
    }
  }

  const toggle = (t: VideoTechnique) => setTech((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))

  return (
    <div className="page">
      <div className="label">02 / Video Lab</div>
      <h1 className="display">Video Lab</h1>

      {!activeProject ? (
        <div className="notice section">
          Il Video Lab lavora dentro un progetto. <Link to="/projects" className="y">Crea o scegli un progetto attivo →</Link>
        </div>
      ) : (
        <>
          <p className="dim">Video del progetto <b className="y">{activeProject.name}</b>. Ogni video parte da un'idea e arriva, passo dopo passo, a un piano di produzione.</p>
          <form className="card section" onSubmit={create}>
            <div className="label" style={{ marginBottom: 12 }}>Nuovo video</div>
            <div className="row" style={{ alignItems: 'stretch' }}>
              <input className="input" style={{ flex: '2 1 220px' }} placeholder="Titolo del video" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
              <select className="select" style={{ flex: '1 1 150px', width: 'auto' }} value={format} onChange={(e) => setFormat(e.target.value as VideoFormat)} aria-label="Formato">
                {Object.entries(FORMAT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <span className="label">Come lo realizzi</span>
              {(Object.keys(TECHNIQUE_LABEL) as VideoTechnique[]).map((t) => (
                <button key={t} type="button" className={`tag ${tech.includes(t) ? 'solid' : ''}`} aria-pressed={tech.includes(t)} onClick={() => toggle(t)}>{TECHNIQUE_LABEL[t]}</button>
              ))}
              <div className="spacer" />
              <button className="btn primary" disabled={!title.trim() || !tech.length}>Crea video</button>
            </div>
          </form>

          <div className="section">
            {videos === undefined ? (
              <div className="row dim"><div className="spinner" /> Caricamento…</div>
            ) : videos.length === 0 ? (
              <div className="empty">Nessun video in questo progetto. Creane uno e scrivi la prima idea.</div>
            ) : (
              <div className="grid cols-2">
                {videos.map((v) => {
                  const done = videoProgress(v)
                  const total = v.scenes.reduce((n, s) => n + s.durationSec, 0)
                  return (
                    <Link key={v.id} to={`/video/${v.id}`} className="card hover">
                      <div className="row">
                        <span className="tag">{FORMAT_LABEL[v.format]}</span>
                        {v.techniques.map((t) => <span key={t} className="tag">{TECHNIQUE_LABEL[t]}</span>)}
                      </div>
                      <h2 className="display" style={{ marginTop: 14 }}>{v.title}</h2>
                      {v.direction && <div className="strip">{v.direction.palette.map((c, i) => <span key={i} style={{ background: c.hex }} />)}</div>}
                      <div className="progress"><span style={{ width: `${(done / 5) * 100}%` }} /></div>
                      <div className="label" style={{ marginTop: 8 }}>
                        Passi {done}/5{v.scenes.length ? ` · ${v.scenes.length} scene · ${fmtDur(total)}` : ''}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      <section className="section">
        <div className="section-head"><span className="num">//</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Prossime fasi</h2></div>
        {[
          ['V2', 'Storyboard, shot list e prompt AI per ogni scena (inquadratura, movimento di camera, luce, transizione)'],
          ['V3', 'Piano di riprese, piano di montaggio, color grading, esportazione in PDF e checklist da telefono'],
        ].map(([id, t]) => <div key={id} className="list-item"><span className="tag">{id}</span><div className="grow dim">{t}</div></div>)}
      </section>
    </div>
  )
}
