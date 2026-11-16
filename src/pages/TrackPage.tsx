import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteTrack, deleteVersion, uid, type Track, type TrackVersion } from '../lib/db'
import { ACCEPT, analyzeFile } from '../lib/audio/client'
import type { AnalysisProgress } from '../lib/audio/types'
import { useApp } from '../components/AppState'
import AnalysisReport, { fmtTime } from '../components/AnalysisReport'
import DiagnosisPanel from '../components/DiagnosisPanel'

export default function TrackPage() {
  const { trackId } = useParams()
  const [params, setParams] = useSearchParams()
  const { toast } = useApp()
  const nav = useNavigate()
  const track = useLiveQuery(() => (trackId ? db.tracks.get(trackId) : undefined), [trackId])
  const versions = useLiveQuery(() => (trackId ? db.versions.where('trackId').equals(trackId).sortBy('createdAt') : []), [trackId])
  const [busy, setBusy] = useState<{ versionId: string; p: AnalysisProgress } | null>(null)
  const [label, setLabel] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const selectedId = params.get('v') ?? versions?.[versions.length - 1]?.id
  const selected = versions?.find((v) => v.id === selectedId)

  if (track === undefined || versions === undefined) return <div className="page"><div className="row dim"><div className="spinner" /> Caricamento…</div></div>
  if (!track) return <div className="page"><div className="notice err">Brano non trovato.</div></div>

  async function runAnalysis(versionId: string, file: File, isNew = false) {
    setBusy({ versionId, p: { stage: 'Avvio', pct: 0 } })
    try {
      const analysis = await analyzeFile(file, (p) => setBusy({ versionId, p }))
      await db.versions.update(versionId, { analysis, analysisError: undefined })
      toast('Analisi completata')
    } catch (e) {
      if (isNew) {
        // file illeggibile appena caricato: non lascia versioni vuote
        await deleteVersion(versionId)
        setParams({})
      } else {
        await db.versions.update(versionId, { analysisError: (e as Error).message })
      }
      toast((e as Error).message, 'err')
    } finally {
      setBusy(null)
    }
  }

  async function upload(file: File) {
    const id = uid()
    const v: TrackVersion = {
      id, trackId: track!.id,
      label: label.trim() || `V${(versions?.length ?? 0) + 1}`,
      fileName: file.name, mime: file.type, size: file.size, notes: '', createdAt: Date.now(),
    }
    try {
      await db.transaction('rw', db.versions, db.audioFiles, db.tracks, async () => {
        await db.versions.add(v)
        await db.audioFiles.add({ versionId: id, blob: file })
        await db.tracks.update(track!.id, { updatedAt: Date.now() })
      })
    } catch (e) {
      const quota = (e as Error).name === 'QuotaExceededError'
      toast(quota ? 'Spazio di archiviazione del browser esaurito. Elimina versioni vecchie.' : `Errore nel salvataggio: ${(e as Error).message}`, 'err')
      return
    }
    setLabel('')
    setParams({ v: id })
    await runAnalysis(id, file, true)
  }

  async function reanalyze(v: TrackVersion) {
    const f = await db.audioFiles.get(v.id)
    if (!f) return toast('File audio non trovato nel database.', 'err')
    await runAnalysis(v.id, new File([f.blob], v.fileName, { type: v.mime }))
  }

  async function removeVersion(v: TrackVersion) {
    if (!confirm(`Eliminare la versione "${v.label}" e il suo file audio?`)) return
    await deleteVersion(v.id)
    setParams({})
  }

  async function removeTrack() {
    if (!confirm(`Eliminare "${track!.title}" con tutte le versioni?`)) return
    await deleteTrack(track!.id)
    toast('Brano eliminato')
    nav('/music')
  }

  return (
    <div className="page">
      <div className="label"><Link to="/music">01 / Music Lab</Link> / Brano</div>
      <h1 className="display">{track.title}</h1>

      {versions.length === 0 && <div className="row section"><Link to={`/music/${track.id}/lyrics`} className="btn ghost sm">Testo e metrica →</Link></div>}

      {/* ---------- upload ---------- */}
      <div className="card section">
        <div className="label" style={{ marginBottom: 12 }}>Carica una nuova versione</div>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <input className="input" style={{ flex: '1 1 180px' }} placeholder={`Nome versione (es. Mix ${(versions.length ?? 0) + 1})`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
          <button className="btn primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>Scegli file audio</button>
          <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
        </div>
        <div className="label" style={{ marginTop: 10 }}>WAV o AIFF consigliati (misure più complete). Anche MP3, M4A. Il file resta sul tuo dispositivo.</div>
        {busy && (
          <div style={{ marginTop: 14 }}>
            <div className="row"><div className="spinner" /><b>{busy.p.stage}</b><div className="spacer" /><span className="mono">{Math.round(busy.p.pct * 100)}%</span></div>
            <div className="progress"><span style={{ width: `${busy.p.pct * 100}%` }} /></div>
          </div>
        )}
      </div>

      {/* ---------- versioni ---------- */}
      {versions.length > 0 && (
        <div className="section">
          <div className="row" style={{ marginBottom: 12 }}>
            {versions.filter((v) => v.analysis).length >= 2 && <Link to={`/music/${track.id}/compare`} className="btn sm">Confronta versioni A/B →</Link>}
            <Link to={`/music/${track.id}/lyrics`} className="btn ghost sm">Testo e metrica →</Link>
          </div>
          <div className="versions">
            {versions.map((v) => (
              <button key={v.id} className={`version ${v.id === selectedId ? 'on' : ''}`} onClick={() => setParams({ v: v.id })}>
                <b>{v.label}</b>
                <span className="mono">{v.analysis ? `${v.analysis.integratedLufs.toFixed(1)} LUFS` : v.analysisError ? 'errore' : busy?.versionId === v.id ? 'analisi…' : 'da analizzare'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && <VersionView key={selected.id} track={track} previous={[...versions].reverse().find((x) => x.createdAt < selected.createdAt && x.analysis)} v={selected} busy={busy?.versionId === selected.id} onReanalyze={() => reanalyze(selected)} onDelete={() => removeVersion(selected)} />}

      <div className="section row">
        <div className="spacer" />
        <button className="btn danger sm" onClick={removeTrack}>Elimina brano</button>
      </div>
    </div>
  )
}

function VersionView({ track, previous, v, busy, onReanalyze, onDelete }: { track: Track; previous?: TrackVersion; v: TrackVersion; busy: boolean; onReanalyze: () => void; onDelete: () => void }) {
  const [tab, setTab] = useState<'report' | 'ai'>('report')
  const diagCount = useLiveQuery(() => db.diagnoses.where('versionId').equals(v.id).count(), [v.id])
  const [url, setUrl] = useState<string>()
  const [time, setTime] = useState(0)
  const [notes, setNotes] = useState(v.notes)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    let u: string | undefined
    db.audioFiles.get(v.id).then((f) => { if (f) { u = URL.createObjectURL(f.blob); setUrl(u) } })
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [v.id])

  // aggiornamento fluido della testina durante la riproduzione
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    let raf = 0
    const tick = () => { setTime(el.currentTime); if (!el.paused) raf = requestAnimationFrame(tick) }
    const onPlay = () => { raf = requestAnimationFrame(tick) }
    const onSeeked = () => setTime(el.currentTime)
    el.addEventListener('play', onPlay); el.addEventListener('seeked', onSeeked)
    return () => { cancelAnimationFrame(raf); el.removeEventListener('play', onPlay); el.removeEventListener('seeked', onSeeked) }
  }, [url])

  const seek = (t: number) => { if (audioRef.current) { audioRef.current.currentTime = t; setTime(t) } }

  return (
    <div className="section">
      <div className="player">
        <div className="row" style={{ gap: 8 }}>
          <b className="y">{v.label}</b>
          <span className="label">{v.fileName} · {(v.size / 1048576).toFixed(1)} MB</span>
          <div className="spacer" />
          <span className="mono">{fmtTime(time)}</span>
        </div>
        {url ? <audio ref={audioRef} src={url} controls preload="metadata" style={{ width: '100%', marginTop: 8 }} /> : <div className="dim">Caricamento audio…</div>}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <input className="input" style={{ flex: '1 1 240px', fontSize: 14 }} placeholder="Note su questa versione (cosa hai cambiato?)" value={notes}
          onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== v.notes && db.versions.update(v.id, { notes })} />
        <button className="btn ghost sm" disabled={busy} onClick={onReanalyze}>Rianalizza</button>
        <button className="btn danger sm" disabled={busy} onClick={onDelete}>Elimina versione</button>
      </div>

      {v.analysisError && !busy && <div className="notice err" style={{ marginTop: 16 }}>{v.analysisError}</div>}
      {v.analysis && (
        <div className="tabs section">
          <button className={tab === 'report' ? 'on' : ''} onClick={() => setTab('report')}>Report misurato</button>
          <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>Diagnosi AI{diagCount ? ` (${diagCount})` : ''}</button>
        </div>
      )}
      {v.analysis
        ? (tab === 'report' ? <AnalysisReport a={v.analysis} time={time} onSeek={seek} /> : <DiagnosisPanel track={track} version={v} previous={previous} />)
        : !v.analysisError && !busy && <div className="empty" style={{ marginTop: 16 }}>Analisi non disponibile. Premi “Rianalizza”.</div>}
    </div>
  )
}
