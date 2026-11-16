import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteTrack, saveProject, uid, type Decision, type Project, type ProjectStatus, type ProjectType } from '../lib/db'
import { useApp } from '../components/AppState'
import { TYPE_LABEL } from './ProjectsPage'

const STATUSES: ProjectStatus[] = ['idea', 'progettazione', 'produzione', 'pubblicato', 'archiviato']
const AREAS: Decision['area'][] = ['generale', 'musica', 'video', 'contenuti', 'art']

export default function ProjectDetailPage() {
  const { id } = useParams()
  const project = useLiveQuery(() => (id ? db.projects.get(id) : undefined), [id])
  const { activeProject, setActiveProjectId, toast } = useApp()
  const nav = useNavigate()

  if (project === undefined) {
    return <div className="page"><div className="row dim"><div className="spinner" /> Caricamento…</div></div>
  }
  if (!project) {
    return <div className="page"><div className="notice err">Progetto non trovato.</div></div>
  }

  const update = async (patch: Partial<Project>) => {
    try {
      await saveProject({ ...project, ...patch })
    } catch (e) {
      toast(`Errore nel salvataggio: ${(e as Error).message}`, 'err')
    }
  }

  const remove = async () => {
    if (!confirm(`Eliminare definitivamente "${project.name}" con tutti i brani e i file audio?`)) return
    const tracks = await db.tracks.where('projectId').equals(project.id).primaryKeys()
    for (const t of tracks) await deleteTrack(t)
    await db.projects.delete(project.id)
    if (activeProject?.id === project.id) setActiveProjectId(null)
    toast('Progetto eliminato')
    nav('/projects')
  }

  const isActive = activeProject?.id === project.id

  return (
    <div className="page">
      <div className="label">00 / Progetto</div>
      <EditableTitle key={project.id + project.name} value={project.name} onSave={(name) => update({ name })} />

      <div className="row" style={{ marginTop: 16 }}>
        <select className="select" style={{ width: 'auto' }} value={project.type} onChange={(e) => update({ type: e.target.value as ProjectType })}>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="select" style={{ width: 'auto' }} value={project.status} onChange={(e) => update({ status: e.target.value as ProjectStatus })}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="spacer" />
        {isActive
          ? <span className="tag solid">Progetto attivo</span>
          : <button className="btn primary sm" onClick={() => { setActiveProjectId(project.id); toast('Progetto attivo impostato') }}>Rendi attivo</button>}
      </div>

      <Section num="01" title="Concept">
        <DescriptionEditor key={project.id} value={project.description} onSave={(description) => update({ description })} />
      </Section>

      <Section num="02" title="Decisioni creative" hint="L'AI le tratterà come vincoli fissi del progetto.">
        <AddRow
          placeholder="es. Voce sempre filtrata, mai pulita"
          extra={(v, set) => (
            <select className="select" style={{ width: 'auto' }} value={v} onChange={(e) => set(e.target.value)}>
              {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          extraDefault="generale"
          onAdd={(text, area) => update({ decisions: [...project.decisions, { id: uid(), text, area: area as Decision['area'], createdAt: Date.now() }] })}
        />
        {project.decisions.map((d) => (
          <div key={d.id} className="list-item">
            <span className="tag y">{d.area}</span>
            <div className="grow">{d.text}</div>
            <button className="btn ghost sm" onClick={() => update({ decisions: project.decisions.filter((x) => x.id !== d.id) })}>×</button>
          </div>
        ))}
      </Section>

      <Section num="03" title="Idee scartate" hint="L'AI non le riproporrà.">
        <AddRow
          placeholder="Idea scartata"
          extra={(v, set) => <input className="input" style={{ flex: '1 1 160px' }} placeholder="Motivo (opzionale)" value={v} onChange={(e) => set(e.target.value)} />}
          extraDefault=""
          onAdd={(text, reason) => update({ discarded: [...project.discarded, { id: uid(), text, reason: reason || undefined, createdAt: Date.now() }] })}
        />
        {project.discarded.map((d) => (
          <div key={d.id} className="list-item">
            <div className="grow"><s className="dim">{d.text}</s>{d.reason && <div className="label">{d.reason}</div>}</div>
            <button className="btn ghost sm" onClick={() => update({ discarded: project.discarded.filter((x) => x.id !== d.id) })}>×</button>
          </div>
        ))}
      </Section>

      <Section num="04" title="Reference">
        <AddRow
          placeholder="Titolo (es. Arca — Nonbinary)"
          extra={(v, set) => <input className="input" style={{ flex: '1 1 160px' }} placeholder="Link o nota" value={v} onChange={(e) => set(e.target.value)} />}
          extraDefault=""
          onAdd={(title, extra) => {
            const isUrl = /^https?:\/\//i.test(extra)
            update({ references: [...project.references, { id: uid(), title, url: isUrl ? extra : undefined, note: isUrl ? undefined : extra || undefined, createdAt: Date.now() }] })
          }}
        />
        {project.references.map((r) => (
          <div key={r.id} className="list-item">
            <div className="grow">
              {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="y">{r.title} ↗</a> : r.title}
              {r.note && <div className="label">{r.note}</div>}
            </div>
            <button className="btn ghost sm" onClick={() => update({ references: project.references.filter((x) => x.id !== r.id) })}>×</button>
          </div>
        ))}
      </Section>

      <Section num="05" title="Obiettivi e scadenze">
        <AddRow
          placeholder="es. Mix finale pronto"
          extra={(v, set) => <input type="date" className="input" style={{ width: 'auto' }} value={v} onChange={(e) => set(e.target.value)} />}
          extraDefault=""
          onAdd={(text, deadline) => update({ goals: [...project.goals, { id: uid(), text, deadline: deadline || undefined, done: false }] })}
        />
        {[...project.goals].sort((a, b) => (a.deadline ?? '9').localeCompare(b.deadline ?? '9')).map((g) => {
          const late = !g.done && g.deadline && g.deadline < new Date().toISOString().slice(0, 10)
          return (
            <div key={g.id} className="list-item">
              <input type="checkbox" checked={g.done} style={{ accentColor: 'var(--y)', width: 18, height: 18, marginTop: 3 }}
                onChange={() => update({ goals: project.goals.map((x) => (x.id === g.id ? { ...x, done: !x.done } : x)) })} />
              <div className="grow" style={g.done ? { textDecoration: 'line-through', color: 'var(--fg-mute)' } : undefined}>
                {g.text}
                {g.deadline && <div className="label" style={late ? { color: 'var(--red)' } : undefined}>{late ? 'Scaduto · ' : ''}{g.deadline}</div>}
              </div>
              <button className="btn ghost sm" onClick={() => update({ goals: project.goals.filter((x) => x.id !== g.id) })}>×</button>
            </div>
          )
        })}
      </Section>

      <div className="section row">
        <span className="label">Creato {new Date(project.createdAt).toLocaleDateString('it-IT')} · modificato {new Date(project.updatedAt).toLocaleString('it-IT')}</span>
        <div className="spacer" />
        <button className="btn danger sm" onClick={remove}>Elimina progetto</button>
      </div>
    </div>
  )
}

function Section({ num, title, hint, children }: { num: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <span className="num">{num}</span>
        <h2 className="display" style={{ fontSize: '1.2rem' }}>{title}</h2>
      </div>
      {hint && <p className="dim" style={{ marginTop: -6, fontSize: 13 }}>{hint}</p>}
      {children}
    </section>
  )
}

function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  return (
    <input
      className="display"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { const t = v.trim(); if (t && t !== value) onSave(t); else setV(value) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      style={{ fontSize: 'clamp(2rem, 6vw, 3.6rem)', background: 'transparent', border: 0, outline: 'none', width: '100%', padding: 0 }}
      aria-label="Nome progetto"
    />
  )
}

function DescriptionEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  const dirty = v !== value
  return (
    <div>
      <textarea className="textarea" rows={5} value={v} onChange={(e) => setV(e.target.value)} placeholder="Di cosa parla questo progetto? Mood, immaginario, suono, obiettivo…" />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary sm" disabled={!dirty} onClick={() => onSave(v)}>Salva concept</button>
        {dirty && <span className="label y">Modifiche non salvate</span>}
      </div>
    </div>
  )
}

function AddRow({ placeholder, onAdd, extra, extraDefault }: {
  placeholder: string
  onAdd: (text: string, extra: string) => void
  extra: (v: string, set: (v: string) => void) => React.ReactNode
  extraDefault: string
}) {
  const [text, setText] = useState('')
  const [ex, setEx] = useState(extraDefault)
  return (
    <form className="row" style={{ marginBottom: 8, alignItems: 'stretch' }}
      onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; onAdd(text.trim(), ex.trim()); setText(''); setEx(extraDefault) }}>
      <input className="input" style={{ flex: '2 1 220px' }} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      {extra(ex, setEx)}
      <button className="btn sm" disabled={!text.trim()}>Aggiungi</button>
    </form>
  )
}
