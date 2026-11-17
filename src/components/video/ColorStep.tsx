import { useState } from 'react'
import AiRunner from '../AiRunner'
import { buildVideoContext, colorPrompt, parseColor } from '../../lib/video/prompts'
import type { ColorPlan } from '../../lib/video/types'
import { EditableList, StepHead, Swatches, TextField, type StepProps } from './common'

export default function ColorStep({ video, project, track, update }: StepProps) {
  const plan = video.colorPlan
  const [software, setSoftware] = useState(plan?.software || 'DaVinci Resolve')
  const setPlan = (p: Partial<ColorPlan>) => plan && update({ colorPlan: { ...plan, ...p, updatedAt: Date.now() } })

  return (
    <section className="section">
      <StepHead num="11" title="Color grading"
        hint="La palette e il look della direzione artistica tradotti in valori e passaggi nel tuo programma di color. Valori indicativi: verificali a occhio su uno schermo il più neutro possibile." />

      {video.direction ? <Swatches palette={video.direction.palette} /> : <div className="notice" style={{ marginBottom: 12 }}>Senza una direzione artistica (passo 02) il piano colore non ha riferimenti.</div>}

      <div className="card">
        <label className="field">
          <span className="label">Programma che usi per il colore</span>
          <input className="input" value={software} onChange={(e) => setSoftware(e.target.value)} placeholder="es. DaVinci Resolve, Premiere Pro, CapCut, Final Cut" />
        </label>
        <AiRunner label={plan ? 'Rifai il piano colore' : 'Crea il piano colore'}
          build={() => colorPrompt(buildVideoContext(video, project, track, 'color'), software.trim())}
          onResult={async (t) => update({ colorPlan: parseColor(t, software.trim()) })} />
      </div>

      {plan && (
        <div className="section">
          <TextField label="Look generale" multiline rows={3} value={plan.overall} onSave={(overall) => setPlan({ overall })} />
          {plan.params.length > 0 && <>
            <div className="label" style={{ margin: '12px 0 6px' }}>Parametri</div>
            <div className="sl-table">
              {plan.params.map((p, i) => <div key={i} className="cg-row"><b>{p.name}</b><span className="mono y">{p.value}</span><span className="dim">{p.why}</span></div>)}
            </div>
          </>}
          {plan.perScene.length > 0 && <>
            <div className="label" style={{ margin: '16px 0 6px' }}>Per scena</div>
            {plan.perScene.map((p, i) => <div key={i} className="list-item"><span className="scene-num" style={{ fontSize: 14 }}>{p.scene}</span><div className="grow"><b>{p.look}</b>{p.note && <div className="dim" style={{ fontSize: 13 }}>{p.note}</div>}</div></div>)}
          </>}
          <div className="section"><EditableList label={`Passaggi in ${plan.software || 'nel programma'}`} items={plan.steps} onSave={(steps) => setPlan({ steps })} /></div>
          {(plan.render3d || video.techniques.includes('3d')) && <div className="section"><TextField label="Render delle parti 3D" multiline rows={3} value={plan.render3d} onSave={(render3d) => setPlan({ render3d })} /></div>}
        </div>
      )}
    </section>
  )
}
