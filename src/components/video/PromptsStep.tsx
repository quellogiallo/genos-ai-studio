import { useState } from 'react'
import AiRunner from '../AiRunner'
import { useApp } from '../AppState'
import { buildVideoContext, parseShotPrompts, shotCodes, shotPromptsPrompt } from '../../lib/video/prompts'
import type { Shot } from '../../lib/video/types'
import { StepHead, TextField, type StepProps } from './common'
import { FramingGlyph } from './shots'

/** Prompt per immagine (fotogramma di riferimento) e note tecniche 3D, per ogni inquadratura. */
export default function PromptsStep({ video, project, track, update }: StepProps) {
  const { toast } = useApp()
  const [onlyMissing, setOnlyMissing] = useState(true)
  const all = shotCodes(video)
  const shots = video.shots ?? []
  const target = all.filter((x) => !onlyMissing || !x.shot.prompt)
  const patch = (id: string, p: Partial<Shot>) => update({ shots: shots.map((s) => (s.id === id ? { ...s, ...p } : s)) })

  if (!all.length) {
    return (
      <section className="section">
        <StepHead num="08" title="Prompt AI" hint="Prompt per ogni inquadratura." />
        <div className="notice">Servono prima le inquadrature (passo 06).</div>
      </section>
    )
  }

  // a blocchi di 12 per non far troncare la risposta
  const batch = target.slice(0, 12)

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast('Copiato') } catch { toast('Il browser ha bloccato la copia', 'err') }
  }

  return (
    <section className="section">
      <StepHead num="08" title="Prompt AI"
        hint="Per ogni inquadratura: un prompt in inglese per generare un fotogramma di riferimento (storyboard, prove di luce e colore) e, per le parti in 3D, le indicazioni tecniche per realizzarle. Ogni prompt ripete le descrizioni delle schede, così personaggi e luoghi restano coerenti." />

      <div className="card">
        <label className="row" style={{ gap: 8, fontSize: 14, marginBottom: 10 }}>
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} style={{ accentColor: 'var(--y)', width: 18, height: 18 }} />
          Solo inquadrature senza prompt
        </label>
        <div className="label" style={{ marginBottom: 10 }}>
          {target.length ? `Prossimo blocco: ${batch.map((x) => x.code).join(', ')}${target.length > batch.length ? ` (poi altre ${target.length - batch.length})` : ''}` : 'Tutte le inquadrature hanno un prompt.'}
        </div>
        <AiRunner
          label="Scrivi i prompt"
          disabledReason={batch.length ? undefined : 'Niente da generare: togli la spunta per rigenerarli tutti.'}
          build={() => shotPromptsPrompt(buildVideoContext(video, project, track, 'prompts'), batch.map((x) => x.code))}
          onResult={async (text) => {
            const map = parseShotPrompts(text)
            let n = 0
            const next = shots.map((s) => {
              const code = all.find((x) => x.shot.id === s.id)?.code
              const r = code ? map.get(code) : undefined
              if (!r) return s
              n++
              return { ...s, prompt: r.prompt || s.prompt, note3d: s.technique === '3d' ? r.note3d || s.note3d : s.note3d }
            })
            if (!n) throw new Error('I codici delle inquadrature nella risposta non corrispondono. Riprova.')
            await update({ shots: next })
          }}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        {all.map(({ code, shot }) => (
          <div key={shot.id} className="pr-item">
            <div className="pr-glyph"><FramingGlyph size={shot.size} movement={shot.movement} angle={shot.angle} /><span className="shot-code">{code}</span></div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="dim" style={{ fontSize: 13, marginBottom: 6 }}>{shot.size} · {shot.description}</div>
              <TextField label="Prompt immagine (inglese)" multiline rows={3} mono value={shot.prompt} onSave={(prompt) => patch(shot.id, { prompt })} placeholder="Non ancora generato" />
              {shot.technique === '3d' && <TextField label="Note per il 3D" multiline rows={3} value={shot.note3d} onSave={(note3d) => patch(shot.id, { note3d })} />}
              {shot.prompt && <button className="btn ghost sm" type="button" onClick={() => copy(shot.prompt)}>Copia prompt</button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
