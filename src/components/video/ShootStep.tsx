import { useState } from 'react'
import { Link } from 'react-router-dom'
import AiRunner from '../AiRunner'
import { uid } from '../../lib/db'
import { buildVideoContext, parseShoot, shootPrompt } from '../../lib/video/prompts'
import { fmtDur, type ShootPlan, type VideoProject } from '../../lib/video/types'
import { EditableList, StepHead, TextField, type StepProps } from './common'
import { codeMap } from './shots'

/** Raggruppamento senza AI: luogo + momento + tecnica. */
export function autoPlan(v: VideoProject): ShootPlan {
  const groups = new Map<string, { location: string; time: string; tech: string; ids: string[] }>()
  for (const sc of v.scenes) {
    for (const t of (v.shots ?? []).filter((x) => x.sceneId === sc.id)) {
      const k = t.technique === '3d' ? '3d' : `${sc.setting.toLowerCase()}|${sc.time.toLowerCase()}`
      const g = groups.get(k) ?? { location: t.technique === '3d' ? 'Computer (3D / codice)' : sc.setting || 'Luogo da definire', time: t.technique === '3d' ? '' : sc.time, tech: t.technique, ids: [] }
      g.ids.push(t.id); groups.set(k, g)
    }
  }
  const days = [...groups.values()].sort((a, b) => (a.tech === '3d' ? 1 : 0) - (b.tech === '3d' ? 1 : 0)).map((g, i) => ({
    id: uid(), title: g.tech === '3d' ? 'Lavoro 3D' : `Blocco ${i + 1}`, location: g.location, time: g.time, shotIds: g.ids, prep: '', gear: [], notes: '',
  }))
  return { days, gear: [], props: v.sheets.filter((s) => s.kind === 'oggetto').map((s) => s.name), risks: [], updatedAt: Date.now() }
}

export default function ShootStep({ video, project, track, update }: StepProps) {
  const [note, setNote] = useState('')
  const plan = video.shootPlan
  const codes = codeMap(video)
  const shots = video.shots ?? []
  const byId = new Map(shots.map((s) => [s.id, s]))

  if (!shots.length) {
    return (
      <section className="section">
        <StepHead num="09" title="Piano di riprese" hint="Come e in che ordine girare." />
        <div className="notice">Servono prima le inquadrature (passo 06).</div>
      </section>
    )
  }

  const assigned = new Set(plan?.days.flatMap((d) => d.shotIds) ?? [])
  const missing = shots.filter((s) => !assigned.has(s.id))
  const setPlan = (p: Partial<ShootPlan>) => update({ shootPlan: { ...(plan ?? autoPlan(video)), ...p, updatedAt: Date.now() } })
  const setDay = (id: string, p: Partial<ShootPlan['days'][number]>) => plan && setPlan({ days: plan.days.map((d) => (d.id === id ? { ...d, ...p } : d)) })

  return (
    <section className="section">
      <StepHead num="09" title="Piano di riprese"
        hint="Le inquadrature riordinate per girarle in modo efficiente: per luogo, luce e configurazione, non in ordine di racconto. Le parti in 3D sono blocchi di lavoro al computer." />

      <div className="card">
        <input className="input" style={{ marginBottom: 10 }} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Vincoli: giorni disponibili, luoghi, attrezzatura che hai (es. Sony a6400, 2 luci LED, niente stabilizzatore)" />
        <div className="row">
          <AiRunner label={plan ? 'Rifai il piano con AI' : 'Crea il piano con AI'}
            build={() => {
              if (plan && !confirm('Il nuovo piano sostituisce quello attuale. Continuare?')) throw new Error('Operazione annullata.')
              return shootPrompt(buildVideoContext(video, project, track, 'shoot'), note.trim())
            }}
            onResult={async (t) => update({ shootPlan: parseShoot(t, video) })} />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn ghost sm" type="button" onClick={() => { if (!plan || confirm('Sostituire il piano attuale con un raggruppamento automatico?')) update({ shootPlan: autoPlan(video) }) }}>Raggruppa automaticamente (senza AI)</button>
          {plan && <Link className="btn sm" to={`/video/${video.id}/checklist`}>Apri checklist da telefono →</Link>}
        </div>
      </div>

      {plan && <>
        {missing.length > 0 && (
          <div className="notice err" style={{ marginTop: 16 }}>
            Inquadrature non pianificate: <b>{missing.map((s) => codes.get(s.id)).join(', ')}</b>.
            <button className="btn ghost sm" type="button" style={{ marginLeft: 8 }} onClick={() => setPlan({ days: [...plan.days, { id: uid(), title: 'Da pianificare', location: '', time: '', shotIds: missing.map((s) => s.id), prep: '', gear: [], notes: '' }] })}>Aggiungile in un blocco</button>
          </div>
        )}
        {plan.days.map((d, i) => {
          const list = d.shotIds.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x)
          return (
            <div key={d.id} className="day">
              <div className="day-head">
                <span className="scene-num">{String(i + 1).padStart(2, '0')}</span>
                <div className="grow"><b>{d.title}</b><div className="label">{[d.location, d.time].filter(Boolean).join(' · ')} · {list.length} inquadrature · {fmtDur(list.reduce((n, s) => n + s.durationSec, 0))} di girato</div></div>
                <button className="btn ghost sm" type="button" aria-label="Elimina blocco" onClick={() => { if (confirm('Eliminare questo blocco? Le inquadrature torneranno "non pianificate".')) setPlan({ days: plan.days.filter((x) => x.id !== d.id) }) }}>×</button>
              </div>
              <div className="day-body">
                {list.map((s) => (
                  <div key={s.id} className="day-shot">
                    <b className="mono">{codes.get(s.id)}</b>
                    <span className="grow"><b>{s.size}</b>{s.movement ? ` · ${s.movement}` : ''}{s.lens ? ` · ${s.lens}` : ''} — <span className="dim">{s.description}</span></span>
                    {plan.days.length > 1 && (
                      <select className="sl-select" value={d.id} aria-label="Sposta in un altro blocco"
                        onChange={(e) => setPlan({ days: plan.days.map((x) => ({ ...x, shotIds: x.id === e.target.value ? [...x.shotIds, s.id] : x.shotIds.filter((y) => y !== s.id) })) })}>
                        {plan.days.map((x, k) => <option key={x.id} value={x.id}>Blocco {k + 1}</option>)}
                      </select>
                    )}
                  </div>
                ))}
                <div className="grid cols-2" style={{ marginTop: 10, gap: 10 }}>
                  <TextField label="Preparazione" multiline rows={2} value={d.prep} onSave={(prep) => setDay(d.id, { prep })} />
                  <TextField label="Note" multiline rows={2} value={d.notes} onSave={(notes) => setDay(d.id, { notes })} />
                </div>
                <EditableList label="Attrezzatura del blocco" items={d.gear} onSave={(gear) => setDay(d.id, { gear })} placeholder="Aggiungi" />
              </div>
            </div>
          )
        })}
        <div className="grid cols-2 section" style={{ gap: 16 }}>
          <EditableList label="Attrezzatura generale" items={plan.gear} onSave={(gear) => setPlan({ gear })} />
          <EditableList label="Oggetti di scena" items={plan.props} onSave={(props) => setPlan({ props })} />
        </div>
        <div className="section"><EditableList label="Rischi" items={plan.risks} onSave={(risks) => setPlan({ risks })} tone="warn" /></div>
      </>}
    </section>
  )
}
