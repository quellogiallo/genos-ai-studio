import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { codeMap } from '../components/video/shots'
import { autoPlan } from '../components/video/ShootStep'
import { fmtDur } from '../lib/video/types'

/** Checklist da usare sul set dal telefono: si spuntano inquadrature, attrezzatura e oggetti. */
export default function VideoChecklistPage() {
  const { videoId } = useParams()
  const v = useLiveQuery(async () => (videoId ? (await db.videos.get(videoId)) ?? null : null), [videoId])
  if (v === undefined) return <div className="page"><div className="row dim"><div className="spinner" /> Caricamento…</div></div>
  if (!v) return <div className="page"><div className="notice err">Video non trovato.</div></div>

  const shots = v.shots ?? []
  const plan = v.shootPlan ?? autoPlan(v)
  const codes = codeMap(v)
  const byId = new Map(shots.map((s) => [s.id, s]))
  const checked = new Set(v.checklist ?? [])
  const done = shots.filter((s) => s.done).length

  const toggleShot = (id: string) => db.videos.update(v.id, { shots: shots.map((s) => (s.id === id ? { ...s, done: !s.done } : s)), updatedAt: Date.now() })
  const toggleItem = (key: string) => {
    const next = new Set(checked); if (next.has(key)) next.delete(key); else next.add(key)
    db.videos.update(v.id, { checklist: [...next], updatedAt: Date.now() })
  }

  const Item = ({ k, label }: { k: string; label: string }) => (
    <label className={`ck ${checked.has(k) ? 'on' : ''}`}><input type="checkbox" checked={checked.has(k)} onChange={() => toggleItem(k)} /><span>{label}</span></label>
  )

  return (
    <div className="page">
      <div className="label"><Link to={`/video/${v.id}?s=riprese`}>02 / Video Lab / {v.title}</Link> / Checklist</div>
      <h1 className="display" style={{ fontSize: 'clamp(1.8rem, 7vw, 3rem)' }}>Sul set</h1>
      {!shots.length ? <div className="notice section">Nessuna inquadratura: crea prima lo storyboard.</div> : <>
        <div className="ck-progress section"><span style={{ width: `${(done / shots.length) * 100}%` }} /></div>
        <div className="label" style={{ marginTop: 6 }}>{done} di {shots.length} inquadrature girate{!v.shootPlan && ' · blocchi raggruppati automaticamente (crea il piano di riprese per averli ottimizzati)'}</div>

        {plan.days.map((d, i) => {
          const list = d.shotIds.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x)
          const dd = list.filter((s) => s.done).length
          return (
            <section key={d.id} className="section">
              <div className="section-head"><span className="num">{String(i + 1).padStart(2, '0')}</span><h2 className="display" style={{ fontSize: '1.15rem' }}>{d.title}</h2><div className="spacer" /><span className="label">{dd}/{list.length}</span></div>
              {(d.location || d.time) && <div className="label" style={{ marginTop: -6, marginBottom: 8 }}>{[d.location, d.time].filter(Boolean).join(' · ')}</div>}
              {d.prep && <div className="notice" style={{ marginBottom: 8, fontSize: 13 }}><b>Prima di iniziare:</b> {d.prep}</div>}
              {d.gear.map((g) => <Item key={g} k={`gear:${d.id}:${g}`} label={`Attrezzatura: ${g}`} />)}
              {list.map((s) => (
                <label key={s.id} className={`ck shot-ck ${s.done ? 'on' : ''}`}>
                  <input type="checkbox" checked={!!s.done} onChange={() => toggleShot(s.id)} />
                  <span><b className="mono">{codes.get(s.id)}</b> <b>{s.size}</b>{s.movement ? ` · ${s.movement}` : ''}{s.lens ? ` · ${s.lens}` : ''} · {fmtDur(s.durationSec)}<br /><span className="dim">{s.description}</span>{s.sheets.length > 0 && <><br /><span className="label">Con: {s.sheets.join(', ')}</span></>}</span>
                </label>
              ))}
            </section>
          )
        })}

        {(plan.gear.length > 0 || plan.props.length > 0) && (
          <section className="section">
            <div className="section-head"><span className="num">//</span><h2 className="display" style={{ fontSize: '1.15rem' }}>Da portare</h2></div>
            {plan.gear.map((g) => <Item key={g} k={`gear:all:${g}`} label={g} />)}
            {plan.props.map((g) => <Item key={g} k={`prop:${g}`} label={`Oggetto di scena: ${g}`} />)}
          </section>
        )}
      </>}
    </div>
  )
}
