import { useState } from 'react'
import AiRunner from '../AiRunner'
import { buildVideoContext, editPrompt, parseEdit } from '../../lib/video/prompts'
import { fmtDur, type EditPlan } from '../../lib/video/types'
import { EditableList, StepHead, TextField, type StepProps } from './common'
import { codeMap } from './shots'

export default function EditStep({ video, project, track, update }: StepProps) {
  const [note, setNote] = useState('')
  const shots = video.shots ?? []
  const codes = codeMap(video)
  const a = track?.analysis
  const bpm = a?.tempo?.bpm
  const beat = bpm ? 60 / bpm : 0

  // timeline: inquadrature in ordine di scena, una dopo l'altra
  const ordered = video.scenes.flatMap((sc) => shots.filter((t) => t.sceneId === sc.id))
  let acc = 0
  const placed = ordered.map((t) => { const start = acc; acc += t.durationSec; return { t, start } })
  const total = Math.max(acc, a?.duration ?? 0, 1)
  const plan = video.editPlan
  const setPlan = (p: Partial<EditPlan>) => plan && update({ editPlan: { ...plan, ...p, updatedAt: Date.now() } })

  function snapToBeats() {
    if (!beat) return
    if (!confirm(`Arrotondare la durata di ogni inquadratura a un numero intero di battiti (1 battito = ${beat.toFixed(2)} s a ${Math.round(bpm!)} BPM)? Le durate delle scene potrebbero cambiare leggermente.`)) return
    update({ shots: shots.map((t) => ({ ...t, durationSec: Math.round(Math.max(1, Math.round(t.durationSec / beat)) * beat * 100) / 100 })) })
  }

  const pct = (s: number) => `${(s / total) * 100}%`
  const sceneStart: number[] = []
  let sacc = 0
  video.scenes.forEach((sc) => { sceneStart.push(sacc); sacc += shots.filter((t) => t.sceneId === sc.id).reduce((n, t) => n + t.durationSec, 0) })

  return (
    <section className="section">
      <StepHead num="10" title="Montaggio"
        hint="La sequenza delle inquadrature sulla timeline del brano, il ritmo dei tagli e i momenti da sincronizzare. Le durate si possono agganciare ai battiti misurati." />

      {placed.length > 0 && (
        <div className="tl">
          {a && <div className="tl-row"><span className="tl-label">Brano</span><div className="tl-track">
            {a.sections.map((s, i) => <div key={i} className="tl-block sec" style={{ left: pct(s.start), width: pct(s.end - s.start) }} title={`${s.label} ${fmtDur(s.start)}–${fmtDur(s.end)}`}>{s.label}</div>)}
          </div></div>}
          <div className="tl-row"><span className="tl-label">Scene</span><div className="tl-track">
            {video.scenes.map((sc, i) => {
              const d = shots.filter((t) => t.sceneId === sc.id).reduce((n, t) => n + t.durationSec, 0)
              return d > 0 ? <div key={sc.id} className="tl-block scn" style={{ left: pct(sceneStart[i]), width: pct(d) }} title={sc.title}>{i + 1}</div> : null
            })}
          </div></div>
          <div className="tl-row"><span className="tl-label">Inquadr.</span><div className="tl-track">
            {placed.map(({ t, start }) => <div key={t.id} className={`tl-block sh ${t.technique === '3d' ? 'is3d' : ''}`} style={{ left: pct(start), width: pct(t.durationSec) }} title={`${codes.get(t.id)} · ${t.size} · ${fmtDur(start)} · ${t.durationSec}s`} />)}
          </div></div>
          <div className="tl-axis"><span>0:00</span><span>{fmtDur(total / 2)}</span><span>{fmtDur(total)}</span></div>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="label">Montato: {fmtDur(acc)}{a ? ` · brano ${fmtDur(a.duration)}` : ''}{a && Math.abs(acc - a.duration) > 2 ? ` · differenza ${acc > a.duration ? '+' : '−'}${fmtDur(Math.abs(acc - a.duration))}` : ''}</span>
            <div className="spacer" />
            {beat > 0 && <button className="btn ghost sm" type="button" onClick={snapToBeats}>Aggancia ai battiti ({Math.round(bpm!)} BPM)</button>}
          </div>
        </div>
      )}
      {!placed.length && <div className="notice">Servono prima le inquadrature (passo 06) per vedere la timeline.</div>}

      <div className="card section">
        <input className="input" style={{ marginBottom: 10 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Indicazione facoltativa (es. programma di montaggio usato, ritmo desiderato)" />
        <AiRunner label={plan ? 'Rifai il piano di montaggio' : 'Crea il piano di montaggio'}
          build={() => editPrompt(buildVideoContext(video, project, track, 'edit'), note.trim())}
          onResult={async (t) => update({ editPlan: parseEdit(t) })} />
      </div>

      {plan && (
        <div className="section">
          <TextField label="Approccio" multiline rows={3} value={plan.approach} onSave={(approach) => setPlan({ approach })} />
          {plan.sections.length > 0 && <>
            <div className="label" style={{ margin: '12px 0 6px' }}>Ritmo per sezione</div>
            {plan.sections.map((s, i) => <div key={i} className="list-item"><span className="tag y">{s.section}</span><div className="grow"><b>{s.rhythm}</b><div className="dim" style={{ fontSize: 13 }}>{s.cuts}</div></div></div>)}
          </>}
          {plan.keyMoments.length > 0 && <>
            <div className="label" style={{ margin: '16px 0 6px' }}>Momenti chiave</div>
            {plan.keyMoments.map((k, i) => <div key={i} className="list-item"><span className="mono y">{k.time}</span><div className="grow">{k.what}</div></div>)}
          </>}
          <div className="grid cols-2 section" style={{ gap: 16 }}>
            <EditableList label="Transizioni" items={plan.transitions} onSave={(transitions) => setPlan({ transitions })} />
            <EditableList label="Da evitare" items={plan.avoid} onSave={(avoid) => setPlan({ avoid })} tone="alert" />
          </div>
        </div>
      )}
    </section>
  )
}
