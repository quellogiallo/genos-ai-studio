import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteVideo } from '../lib/db'
import { useApp } from '../components/AppState'
import { FORMAT_LABEL, TECHNIQUE_LABEL, fmtDur, type VideoFormat, type VideoProject, type VideoTechnique } from '../lib/video/types'
import type { TrackInfo } from '../lib/video/prompts'
import { InlineInput, type StepProps } from '../components/video/common'
import ConceptStep from '../components/video/ConceptStep'
import DirectionStep from '../components/video/DirectionStep'
import MoodboardStep from '../components/video/MoodboardStep'
import SheetsStep from '../components/video/SheetsStep'
import ScreenplayStep from '../components/video/ScreenplayStep'
import StoryboardStep from '../components/video/StoryboardStep'
import ShotListStep from '../components/video/ShotListStep'
import PromptsStep from '../components/video/PromptsStep'
import ShootStep from '../components/video/ShootStep'
import EditStep from '../components/video/EditStep'
import ColorStep from '../components/video/ColorStep'
import ExportStep from '../components/video/ExportStep'

const STEPS = [
  { id: 'concept', n: '01', label: 'Concept', done: (v: VideoProject) => !!v.concept, C: ConceptStep },
  { id: 'direzione', n: '02', label: 'Direzione', done: (v: VideoProject) => !!v.direction, C: DirectionStep },
  { id: 'moodboard', n: '03', label: 'Moodboard', done: (v: VideoProject) => v.mood.length > 0, C: MoodboardStep },
  { id: 'schede', n: '04', label: 'Schede', done: (v: VideoProject) => v.sheets.length > 0, C: SheetsStep },
  { id: 'sceneggiatura', n: '05', label: 'Sceneggiatura', done: (v: VideoProject) => v.scenes.length > 0, C: ScreenplayStep },
  { id: 'storyboard', n: '06', label: 'Storyboard', done: (v: VideoProject) => (v.shots?.length ?? 0) > 0, C: StoryboardStep },
  { id: 'shotlist', n: '07', label: 'Shot list', done: (v: VideoProject) => (v.shots?.length ?? 0) > 0, C: ShotListStep },
  { id: 'prompt', n: '08', label: 'Prompt AI', done: (v: VideoProject) => (v.shots ?? []).some((s) => s.prompt), C: PromptsStep },
  { id: 'riprese', n: '09', label: 'Riprese', done: (v: VideoProject) => !!v.shootPlan, C: ShootStep },
  { id: 'montaggio', n: '10', label: 'Montaggio', done: (v: VideoProject) => !!v.editPlan, C: EditStep },
  { id: 'color', n: '11', label: 'Color', done: (v: VideoProject) => !!v.colorPlan, C: ColorStep },
  { id: 'export', n: '12', label: 'Export', done: () => false, C: ExportStep },
] as const

export default function VideoPage() {
  const { videoId } = useParams()
  const [params, setParams] = useSearchParams()
  const { toast } = useApp()
  const nav = useNavigate()

  const video = useLiveQuery(async () => (videoId ? (await db.videos.get(videoId)) ?? null : null), [videoId])
  const project = useLiveQuery(async () => (video ? (await db.projects.get(video.projectId)) ?? null : undefined), [video?.projectId])
  const tracks = useLiveQuery(() => (video ? db.tracks.where('projectId').equals(video.projectId).toArray() : []), [video?.projectId])
  // brano collegato: usa l'analisi dell'ultima versione analizzata (dati misurati)
  const track = useLiveQuery(async (): Promise<TrackInfo | null> => {
    if (!video?.trackId) return null
    const t = await db.tracks.get(video.trackId)
    if (!t) return null
    const vs = await db.versions.where('trackId').equals(t.id).sortBy('createdAt')
    return { title: t.title, analysis: vs.reverse().find((x) => x.analysis)?.analysis }
  }, [video?.trackId])

  const loading = <div className="page"><div className="row dim"><div className="spinner" /> Caricamento…</div></div>
  if (video === undefined) return loading
  if (!video) return <div className="page"><div className="notice err">Video non trovato. <Link to="/video" className="y">Torna al Video Lab →</Link></div></div>
  if (project === undefined) return loading
  if (!project) return <div className="page"><div className="notice err">Il progetto di questo video non esiste più.</div></div>

  const update: StepProps['update'] = async (patch) => {
    try {
      await db.videos.update(video.id, { ...patch, updatedAt: Date.now() })
    } catch (e) {
      toast(`Errore nel salvataggio: ${(e as Error).message}`, 'err')
      throw e
    }
  }

  async function remove() {
    if (!video || !confirm(`Eliminare definitivamente il video "${video.title}" con moodboard, schede, sceneggiatura, storyboard e piani?`)) return
    await deleteVideo(video.id)
    toast('Video eliminato')
    nav('/video')
  }

  const toggleTech = (t: VideoTechnique) => {
    const next = video.techniques.includes(t) ? video.techniques.filter((x) => x !== t) : [...video.techniques, t]
    if (!next.length) { toast('Serve almeno una tecnica', 'err'); return }
    update({ techniques: next })
  }

  const stepId = STEPS.some((s) => s.id === params.get('s')) ? params.get('s')! : 'concept'
  const step = STEPS.find((s) => s.id === stepId)!
  const idx = STEPS.indexOf(step)
  const Step = step.C

  return (
    <div className="page">
      <div className="label"><Link to="/video" style={{ textDecoration: 'none' }}>02 / Video Lab</Link> / {project.name}</div>
      <TitleInput key={video.id} value={video.title} onSave={(title) => update({ title })} />

      <div className="row" style={{ marginTop: 16 }}>
        <select className="select" style={{ width: 'auto' }} value={video.format} aria-label="Formato" onChange={(e) => update({ format: e.target.value as VideoFormat })}>
          {Object.entries(FORMAT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {(Object.keys(TECHNIQUE_LABEL) as VideoTechnique[]).map((t) => (
          <button key={t} type="button" className={`tag ${video.techniques.includes(t) ? 'solid' : ''}`} aria-pressed={video.techniques.includes(t)} onClick={() => toggleTech(t)}>{TECHNIQUE_LABEL[t]}</button>
        ))}
      </div>

      <div className="row" style={{ marginTop: 12, alignItems: 'stretch' }}>
        <select className="select" style={{ flex: '2 1 220px', width: 'auto' }} value={video.trackId ?? ''} aria-label="Brano collegato"
          onChange={(e) => update({ trackId: e.target.value || undefined })}>
          <option value="">Nessun brano collegato</option>
          {(tracks ?? []).map((t) => <option key={t.id} value={t.id}>Brano: {t.title}</option>)}
        </select>
        {!track?.analysis && (
          <InlineInput style={{ flex: '1 1 150px' }} type="number" min={0} value={video.targetSec ? String(video.targetSec) : ''} placeholder="Durata prevista (secondi)"
            onSave={(v) => update({ targetSec: Math.max(0, Math.round(Number(v) || 0)) })} />
        )}
      </div>
      <div className="label" style={{ marginTop: 8 }}>
        {track?.analysis
          ? `Sincronizzato sul brano: ${fmtDur(track.analysis.duration)}${track.analysis.tempo ? ` · ~${Math.round(track.analysis.tempo.bpm)} BPM` : ''} · ${track.analysis.sections.length} sezioni (dati dal Music Lab)`
          : track
            ? 'Questo brano non ha ancora un\'analisi nel Music Lab: durata e struttura non sono disponibili.'
            : (tracks?.length ?? 0) === 0
              ? 'Nessun brano nel Music Lab per questo progetto: se ne carichi uno, le scene potranno seguirne la struttura.'
              : 'Collega un brano per sincronizzare le scene sulla sua struttura.'}
      </div>

      <nav className="wf-steps" aria-label="Passi del workflow">
        {STEPS.map((s) => (
          <button key={s.id} type="button" className={`step ${s.id === stepId ? 'on' : ''} ${s.done(video) ? 'done' : ''}`}
            ref={s.id === stepId ? (el) => { el?.scrollIntoView({ block: 'nearest', inline: 'center' }) } : undefined}
            aria-current={s.id === stepId ? 'step' : undefined} onClick={() => setParams({ s: s.id })}>
            <span className="mono">{s.n}</span>{s.label}
          </button>
        ))}
      </nav>

      <Step video={video} project={project} track={track ?? undefined} update={update} />

      <div className="section row">
        {idx > 0 && <button className="btn ghost" type="button" onClick={() => { setParams({ s: STEPS[idx - 1].id }); window.scrollTo(0, 0) }}>← {STEPS[idx - 1].label}</button>}
        {idx < STEPS.length - 1 && <button className="btn" type="button" onClick={() => { setParams({ s: STEPS[idx + 1].id }); window.scrollTo(0, 0) }}>{STEPS[idx + 1].label} →</button>}
        <div className="spacer" />
        <button className="btn danger sm" type="button" onClick={remove}>Elimina video</button>
      </div>
    </div>
  )
}

function TitleInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  return (
    <input
      className="display"
      defaultValue={value}
      onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== value) onSave(t); else e.target.value = value }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      style={{ fontSize: 'clamp(2rem, 6vw, 3.6rem)', background: 'transparent', border: 0, outline: 'none', width: '100%', padding: 0 }}
      aria-label="Titolo del video"
    />
  )
}
