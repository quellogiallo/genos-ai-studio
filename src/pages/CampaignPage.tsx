import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { saveCampaign, useSources } from '../lib/content/hooks'
import { FORMAT_LABEL, PLATFORM_LABEL, dayOffset, type ContentFormat, type Platform } from '../lib/content/types'
import { TextField } from '../components/video/common'
import StrategyTab from '../components/content/StrategyTab'
import IdeasTab from '../components/content/IdeasTab'
import CalendarTab from '../components/content/CalendarTab'
import StatsTab from '../components/content/StatsTab'

const TABS = [
  { id: 'strategia', n: 'C1', label: 'Strategia' },
  { id: 'idee', n: 'C2', label: 'Idee e script' },
  { id: 'calendario', n: 'C3', label: 'Calendario' },
  { id: 'statistiche', n: 'C4', label: 'Statistiche' },
  { id: 'impostazioni', n: '//', label: 'Impostazioni' },
] as const

export default function CampaignPage() {
  const { campaignId } = useParams()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const c = useLiveQuery(async () => (campaignId ? (await db.campaigns.get(campaignId)) ?? null : null), [campaignId])
  const src = useSources(c)
  const options = useLiveQuery(async () => {
    if (!c) return null
    const [tracks, videos] = await Promise.all([db.tracks.where('projectId').equals(c.projectId).toArray(), db.videos.where('projectId').equals(c.projectId).toArray()])
    return { tracks: tracks.filter((t) => t.kind !== 'reference'), videos }
  }, [c?.projectId])

  if (c === undefined || (c && !src)) return <div className="page"><div className="row dim"><div className="spinner" /> Caricamento…</div></div>
  if (!c || !src) return <div className="page"><div className="notice err">Campagna non trovata.</div></div>

  const tab = (TABS.find((t) => t.id === params.get('t')) ?? TABS[0]).id
  const d = dayOffset(new Date().toISOString().slice(0, 10), c.releaseDate)
  const toggle = <T,>(arr: T[], x: T) => (arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x])

  return (
    <div className="page">
      <div className="label"><Link to="/content">03 / Content Lab</Link> / Campagna</div>
      <h1 className="display">{c.title}</h1>
      <div className="row" style={{ marginTop: 10 }}>
        <span className="tag solid">{d < 0 ? `Uscita tra ${-d} giorni` : d === 0 ? 'Esce oggi' : `Uscita ${d} giorni fa`}</span>
        <span className="label">{new Date(c.releaseDate + 'T12:00:00').toLocaleDateString('it-IT', { dateStyle: 'long' })}</span>
        {src.track && <Link className="tag" to={`/music/${src.track.id}`} style={{ textDecoration: 'none' }}>♪ {src.track.title}{src.version ? '' : ' (non analizzato)'}</Link>}
        {src.video && <Link className="tag" to={`/video/${src.video.id}`} style={{ textDecoration: 'none' }}>▶ {src.video.title}</Link>}
      </div>

      <nav className="wf-steps section" aria-label="Sezioni della campagna">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`step ${tab === t.id ? 'on' : ''}`} onClick={() => setParams({ t: t.id })}>
            <span className="mono">{t.n}</span>{t.label}
          </button>
        ))}
      </nav>

      {tab === 'strategia' && <StrategyTab c={c} src={src} />}
      {tab === 'idee' && <IdeasTab c={c} src={src} />}
      {tab === 'calendario' && <CalendarTab c={c} />}
      {tab === 'statistiche' && <StatsTab c={c} src={src} />}
      {tab === 'impostazioni' && (
        <section className="section">
          <div className="card">
            <TextField label="Nome" value={c.title} onSave={(title) => title.trim() && saveCampaign(c, { title: title.trim() })} />
            <label className="field"><span className="label">Data di uscita</span><input type="date" className="input" value={c.releaseDate} onChange={(e) => e.target.value && saveCampaign(c, { releaseDate: e.target.value })} /></label>
            <div className="row" style={{ alignItems: 'stretch' }}>
              <select className="select" style={{ flex: '1 1 200px', width: 'auto' }} value={c.trackId ?? ''} onChange={(e) => saveCampaign(c, { trackId: e.target.value || undefined })} aria-label="Brano collegato">
                <option value="">Nessun brano collegato</option>
                {options?.tracks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
              <select className="select" style={{ flex: '1 1 200px', width: 'auto' }} value={c.videoId ?? ''} onChange={(e) => saveCampaign(c, { videoId: e.target.value || undefined })} aria-label="Video collegato">
                <option value="">Nessun video collegato</option>
                {options?.videos.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
              </select>
            </div>
            <div className="label" style={{ margin: '14px 0 6px' }}>Piattaforme</div>
            <div className="pills">{(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => <button key={p} type="button" className={`chip ${c.platforms.includes(p) ? 'on' : ''}`} onClick={() => { const n = toggle(c.platforms, p); if (n.length) saveCampaign(c, { platforms: n }) }}>{PLATFORM_LABEL[p]}</button>)}</div>
            <div className="label" style={{ margin: '14px 0 6px' }}>Contenuti che sei disposto a fare</div>
            <div className="pills">{(Object.keys(FORMAT_LABEL) as ContentFormat[]).map((f) => <button key={f} type="button" className={`chip ${c.formats.includes(f) ? 'on' : ''}`} onClick={() => { const n = toggle(c.formats, f); if (n.length) saveCampaign(c, { formats: n }) }}>{FORMAT_LABEL[f]}</button>)}</div>
            <div className="row" style={{ marginTop: 14 }}>
              <span className="label">Contenuti a settimana</span>
              {[1, 2, 3, 5, 7].map((n) => <button key={n} type="button" className={`chip ${c.perWeek === n ? 'on' : ''}`} onClick={() => saveCampaign(c, { perWeek: n })}>{n}</button>)}
            </div>
            <div style={{ marginTop: 14 }}><TextField label="Note per l'AI (vincoli, risposte alle domande, idee)" multiline rows={3} value={c.notes} onSave={(notes) => saveCampaign(c, { notes })} /></div>
          </div>
          <div className="row section">
            <div className="spacer" />
            <button className="btn danger sm" onClick={async () => { if (confirm(`Eliminare la campagna "${c.title}" con strategia, idee, calendario e statistiche?`)) { await db.campaigns.delete(c.id); nav('/content') } }}>Elimina campagna</button>
          </div>
        </section>
      )}
    </div>
  )
}
