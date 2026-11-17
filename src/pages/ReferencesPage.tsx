import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteTrack, saveProject, uid, type Track, type TrackVersion } from '../lib/db'
import { ACCEPT, analyzeFile } from '../lib/audio/client'
import type { AnalysisProgress } from '../lib/audio/types'
import { useApp } from '../components/AppState'
import { fmtTime } from '../components/AnalysisReport'

export const FOCUS = ['Loudness e dinamica', 'Basse frequenze', 'Immagine stereo', 'Bilanciamento tonale', 'Voce', 'Arrangiamento', 'Sound design', 'Mood']

export default function ReferencesPage() {
  const { activeProject, toast } = useApp()
  const nav = useNavigate()
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [notes, setNotes] = useState('')
  const [focus, setFocus] = useState<string[]>([])
  const [busy, setBusy] = useState<AnalysisProgress | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const data = useLiveQuery(async () => {
    if (!activeProject) return { refs: [], own: [] }
    const ts = await db.tracks.where('projectId').equals(activeProject.id).toArray()
    const withV = await Promise.all(ts.map(async (t) => ({ t, v: [...(await db.versions.where('trackId').equals(t.id).sortBy('createdAt'))].reverse().find((x) => x.analysis) })))
    return { refs: withV.filter((x) => x.t.kind === 'reference'), own: withV.filter((x) => x.t.kind !== 'reference' && x.v) }
  }, [activeProject?.id])

  async function upload(file: File) {
    if (!activeProject || !title.trim()) return
    const now = Date.now()
    const t: Track = { id: uid(), projectId: activeProject.id, title: title.trim(), artist: artist.trim() || undefined, notes: notes.trim(), kind: 'reference', refFocus: focus, createdAt: now, updatedAt: now }
    const v: TrackVersion = { id: uid(), trackId: t.id, label: 'Reference', fileName: file.name, mime: file.type, size: file.size, notes: '', createdAt: now }
    setBusy({ stage: 'Avvio', pct: 0 })
    try {
      const analysis = await analyzeFile(file, setBusy)
      await db.transaction('rw', db.tracks, db.versions, db.audioFiles, async () => {
        await db.tracks.add(t)
        await db.versions.add({ ...v, analysis })
        await db.audioFiles.add({ versionId: v.id, blob: file })
      })
      // la reference entra anche tra le reference del progetto, così l'AI la conosce ovunque
      const p = await db.projects.get(activeProject.id)
      if (p) await saveProject({ ...p, references: [...p.references, { id: uid(), title: `${t.artist ? `${t.artist} — ` : ''}${t.title}`, note: `Reference audio nel Music Lab${focus.length ? ` · focus: ${focus.join(', ')}` : ''}${t.notes ? ` · ${t.notes}` : ''}`, createdAt: now }] })
      setTitle(''); setArtist(''); setNotes(''); setFocus([])
      toast('Reference aggiunta e analizzata')
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally { setBusy(null) }
  }

  if (!activeProject) return <div className="page"><h1 className="display">Reference</h1><div className="notice section">Serve un progetto attivo. <Link to="/projects" className="y">Scegline uno →</Link></div></div>

  return (
    <div className="page">
      <div className="label"><Link to="/music">01 / Music Lab</Link> / Reference</div>
      <h1 className="display">Reference</h1>
      <p className="dim">Brani di altri artisti da usare come riferimento. Vengono analizzati come i tuoi e puoi confrontarli con i tuoi mix nel lettore A/B a volume allineato. Restano solo sul tuo dispositivo.</p>

      <div className="card section">
        <div className="label" style={{ marginBottom: 12 }}>Nuova reference</div>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <input className="input" style={{ flex: '2 1 200px' }} placeholder="Titolo del brano" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" style={{ flex: '1 1 160px' }} placeholder="Artista" value={artist} onChange={(e) => setArtist(e.target.value)} />
        </div>
        <div className="label" style={{ margin: '12px 0 6px' }}>Cosa prendi come riferimento?</div>
        <div className="pills">
          {FOCUS.map((f) => <button key={f} type="button" className={`chip ${focus.includes(f) ? 'on' : ''}`} onClick={() => setFocus((x) => (x.includes(f) ? x.filter((y) => y !== f) : [...x, f]))}>{f}</button>)}
        </div>
        <input className="input" style={{ marginTop: 10 }} placeholder="Perché questa reference? (opzionale) Es. «basso enorme ma voce sempre leggibile»" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={!title.trim() || !!busy} onClick={() => fileRef.current?.click()}>Scegli file audio e analizza</button>
          <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
        </div>
        {busy && <div style={{ marginTop: 12 }}><div className="row"><div className="spinner" /><b>{busy.stage}</b><div className="spacer" /><span className="mono">{Math.round(busy.pct * 100)}%</span></div><div className="progress"><span style={{ width: `${busy.pct * 100}%` }} /></div></div>}
      </div>

      <section className="section">
        {data?.refs.length === 0 && <div className="empty">Nessuna reference in questo progetto.</div>}
        <div className="grid cols-2">
          {data?.refs.map(({ t, v }) => (
            <div key={t.id} className="card">
              <div className="row">{t.refFocus?.map((f) => <span key={f} className="tag y">{f}</span>)}</div>
              <h2 className="display" style={{ marginTop: 12, fontSize: '1.4rem' }}>{t.title}</h2>
              {t.artist && <div className="dim">{t.artist}</div>}
              {t.notes && <p className="dim" style={{ fontSize: 13 }}>{t.notes}</p>}
              {v?.analysis && <div className="label" style={{ marginTop: 8 }}>{v.analysis.integratedLufs.toFixed(1)} LUFS · {v.analysis.truePeakDb.toFixed(1)} dBTP · LRA {v.analysis.lra.toFixed(1)} · {v.analysis.tempo ? `${v.analysis.tempo.bpm} BPM · ` : ''}{fmtTime(v.analysis.duration)}</div>}
              <div className="row" style={{ marginTop: 12 }}>
                <Link to={`/music/${t.id}`} className="btn ghost sm">Report</Link>
                {v && data.own.length > 0 && (
                  <select className="select" style={{ width: 'auto', flex: '1 1 160px', fontSize: 13 }} value="" onChange={(e) => { const own = data.own.find((o) => o.t.id === e.target.value); if (own?.v) nav(`/music/${own.t.id}/compare?a=${own.v.id}&b=${v.id}`) }}>
                    <option value="">Confronta con un mio brano…</option>
                    {data.own.map((o) => <option key={o.t.id} value={o.t.id}>{o.t.title} — {o.v!.label}</option>)}
                  </select>
                )}
                <button className="btn danger sm" onClick={async () => { if (confirm(`Eliminare la reference "${t.title}"?`)) await deleteTrack(t.id) }}>×</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
