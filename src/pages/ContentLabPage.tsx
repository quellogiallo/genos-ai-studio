import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, setSetting, uid } from '../lib/db'
import { useApp } from '../components/AppState'
import { DEFAULT_PREFS, getPrefs, type ContentPrefs } from '../lib/content/hooks'
import { FORMAT_LABEL, PLATFORM_LABEL, addDays, dayOffset, type Campaign, type ContentFormat, type Platform } from '../lib/content/types'

export default function ContentLabPage() {
  const { activeProject, toast } = useApp()
  const nav = useNavigate()
  const [title, setTitle] = useState('')
  const [release, setRelease] = useState(addDays(new Date().toISOString().slice(0, 10), 28))
  const [trackId, setTrackId] = useState('')
  const [videoId, setVideoId] = useState('')
  const [prefs, setPrefs] = useState<ContentPrefs>(DEFAULT_PREFS)
  useEffect(() => { getPrefs().then(setPrefs) }, [])

  const data = useLiveQuery(async () => {
    if (!activeProject) return null
    const [campaigns, tracks, videos] = await Promise.all([
      db.campaigns.where('projectId').equals(activeProject.id).reverse().sortBy('updatedAt'),
      db.tracks.where('projectId').equals(activeProject.id).toArray(),
      db.videos.where('projectId').equals(activeProject.id).toArray(),
    ])
    return { campaigns, tracks: tracks.filter((t) => t.kind !== 'reference'), videos }
  }, [activeProject?.id])

  if (!activeProject) return <div className="page"><div className="label">03 / Content Lab</div><h1 className="display">Content Lab</h1><div className="notice section">Serve un progetto attivo. <Link to="/projects" className="y">Scegline uno →</Link></div></div>

  const toggle = <T,>(arr: T[], x: T) => (arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !prefs.platforms.length || !prefs.formats.length) return
    const now = Date.now()
    const c: Campaign = {
      id: uid(), projectId: activeProject!.id, title: title.trim(), releaseDate: release,
      trackId: trackId || undefined, videoId: videoId || undefined,
      platforms: prefs.platforms, perWeek: prefs.perWeek, formats: prefs.formats, notes: '',
      ideas: [], posts: [], stats: [], createdAt: now, updatedAt: now,
    }
    await db.campaigns.add(c)
    await setSetting('contentPrefs', prefs)
    toast('Campagna creata')
    nav(`/content/${c.id}`)
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="page">
      <div className="label">03 / Content Lab</div>
      <h1 className="display">Content<br /><span className="y">Lab</span></h1>
      <p className="dim">Una campagna per ogni uscita: strategia, idee e script per TikTok e Instagram, calendario e analisi dei risultati. Usa il brano del Music Lab e la direzione artistica del Video Lab se li colleghi.</p>

      <form className="card section" onSubmit={create}>
        <div className="label" style={{ marginBottom: 12 }}>Nuova campagna</div>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <input className="input" style={{ flex: '2 1 220px' }} placeholder="Nome (es. Uscita singolo Fossile)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
          <label className="row" style={{ flex: '1 1 180px', gap: 8 }}><span className="label">Uscita</span><input type="date" className="input" style={{ flex: 1 }} value={release} onChange={(e) => setRelease(e.target.value)} required /></label>
        </div>
        <div className="row" style={{ alignItems: 'stretch', marginTop: 10 }}>
          <select className="select" style={{ flex: '1 1 200px', width: 'auto' }} value={trackId} onChange={(e) => setTrackId(e.target.value)} aria-label="Brano">
            <option value="">Brano del Music Lab (opzionale)</option>
            {data?.tracks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <select className="select" style={{ flex: '1 1 200px', width: 'auto' }} value={videoId} onChange={(e) => setVideoId(e.target.value)} aria-label="Video">
            <option value="">Video del Video Lab (opzionale)</option>
            {data?.videos.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
          </select>
        </div>
        <div className="label" style={{ margin: '14px 0 6px' }}>Piattaforme</div>
        <div className="pills">{(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => <button key={p} type="button" className={`chip ${prefs.platforms.includes(p) ? 'on' : ''}`} onClick={() => setPrefs({ ...prefs, platforms: toggle(prefs.platforms, p) })}>{PLATFORM_LABEL[p]}</button>)}</div>
        <div className="label" style={{ margin: '14px 0 6px' }}>Contenuti che sei disposto a fare</div>
        <div className="pills">{(Object.keys(FORMAT_LABEL) as ContentFormat[]).map((f) => <button key={f} type="button" className={`chip ${prefs.formats.includes(f) ? 'on' : ''}`} onClick={() => setPrefs({ ...prefs, formats: toggle(prefs.formats, f) })}>{FORMAT_LABEL[f]}</button>)}</div>
        <div className="row" style={{ marginTop: 14 }}>
          <span className="label">Contenuti a settimana</span>
          {[1, 2, 3, 5, 7].map((n) => <button key={n} type="button" className={`chip ${prefs.perWeek === n ? 'on' : ''}`} onClick={() => setPrefs({ ...prefs, perWeek: n })}>{n}</button>)}
        </div>
        <button className="btn primary" style={{ marginTop: 16 }} disabled={!title.trim() || !prefs.platforms.length || !prefs.formats.length}>Crea campagna</button>
      </form>

      <section className="section">
        {data?.campaigns.length === 0 && <div className="empty">Nessuna campagna in questo progetto.</div>}
        <div className="grid cols-2">
          {data?.campaigns.map((c) => {
            const d = dayOffset(today, c.releaseDate)
            const published = c.posts.filter((p) => p.status === 'pubblicato').length
            return (
              <Link key={c.id} to={`/content/${c.id}`} className="card hover">
                <div className="row"><span className="tag y">{d < 0 ? `Uscita tra ${-d} giorni` : d === 0 ? 'Esce oggi' : `Uscita ${d} giorni fa`}</span>{c.strategy && <span className="tag">Strategia</span>}</div>
                <h2 className="display" style={{ marginTop: 12 }}>{c.title}</h2>
                <div className="label" style={{ marginTop: 10 }}>{c.ideas.length} idee · {c.posts.length} in calendario · {published} pubblicati · {c.platforms.map((p) => PLATFORM_LABEL[p]).join(' + ')}</div>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
