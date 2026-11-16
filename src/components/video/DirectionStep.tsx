import { useState } from 'react'
import AiRunner from '../AiRunner'
import { useApp } from '../AppState'
import { saveProject, uid } from '../../lib/db'
import { buildVideoContext, directionsPrompt, parseDirections } from '../../lib/video/prompts'
import type { ArtDirection, PaletteColor } from '../../lib/video/types'
import { EditableList, InlineInput, StepHead, Swatches, TextField, type StepProps } from './common'

export default function DirectionStep({ video, project, track, update }: StepProps) {
  const { toast } = useApp()
  const [note, setNote] = useState('')
  const d = video.direction
  const patch = (p: Partial<ArtDirection>) => { if (d) update({ direction: { ...d, ...p } }) }

  function choose(p: ArtDirection) {
    // la direzione precedente torna tra le proposte: nulla va perso
    const back = d ? [d] : []
    update({ direction: p, proposals: [...video.proposals.filter((x) => x.id !== p.id), ...back] })
    toast(`Direzione scelta: ${p.name}`)
  }

  async function discard(p: ArtDirection) {
    const reason = prompt(`Perché scarti "${p.name}"? (facoltativo: aiuta l'AI a non riproporla)`)
    if (reason === null) return
    await saveProject({
      ...project,
      discarded: [...project.discarded, { id: uid(), text: `Direzione video "${p.name}": ${p.logline}`, reason: reason.trim() || undefined, createdAt: Date.now() }],
    })
    await update({ proposals: video.proposals.filter((x) => x.id !== p.id) })
    toast('Scartata: non verrà riproposta')
  }

  async function fix() {
    if (!d) return
    await saveProject({
      ...project,
      decisions: [...project.decisions, { id: uid(), area: 'video', text: `Video "${video.title}" — direzione artistica "${d.name}": ${d.logline}`, createdAt: Date.now() }],
    })
    toast('Aggiunta alle decisioni del progetto')
  }

  const setColor = (i: number, p: Partial<PaletteColor>) => patch({ palette: d!.palette.map((c, j) => (j === i ? { ...c, ...p } : c)) })

  return (
    <section className="section">
      <StepHead num="02" title="Direzione artistica"
        hint="L'AI propone tre strade diverse, ognuna con motivazione e limiti. Ne scegli una: diventa la regola visiva per tutte le scene. Quelle che scarti non verranno riproposte." />

      {!video.concept && <div className="notice" style={{ marginBottom: 16 }}>Non hai ancora analizzato il concept: le proposte saranno più generiche.</div>}

      {d && (
        <div className="card chosen">
          <div className="row">
            <span className="tag solid">Direzione scelta</span>
            <div className="spacer" />
            <button className="btn ghost sm" type="button" onClick={fix}>Fissa come decisione del progetto</button>
          </div>
          <TextField label="Nome" value={d.name} onSave={(name) => patch({ name })} />
          <TextField label="Idea visiva" multiline rows={2} value={d.logline} onSave={(logline) => patch({ logline })} />

          <div className="label">Palette</div>
          <Swatches palette={d.palette} />
          {d.palette.map((c, i) => (
            <div key={i} className="row pal-row">
              <input type="color" value={c.hex} aria-label="Colore" onChange={(e) => setColor(i, { hex: e.target.value })} />
              <InlineInput style={{ flex: '1 1 110px' }} value={c.name} placeholder="Nome" onSave={(name) => setColor(i, { name })} />
              <InlineInput style={{ flex: '2 1 160px' }} value={c.role} placeholder="Dove si usa" onSave={(role) => setColor(i, { role })} />
              <button className="btn ghost sm" type="button" aria-label="Rimuovi colore" onClick={() => patch({ palette: d.palette.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <button className="btn sm" type="button" style={{ margin: '8px 0 16px' }} onClick={() => patch({ palette: [...d.palette, { hex: '#ffd400', name: '', role: '' }] })}>+ Colore</button>

          <div className="grid cols-2">
            <TextField label="Look" multiline value={d.look} onSave={(look) => patch({ look })} />
            <TextField label="Luce" multiline value={d.light} onSave={(light) => patch({ light })} />
            <TextField label="Texture e materiali" multiline value={d.texture} onSave={(texture) => patch({ texture })} />
            <TextField label="Linguaggio di camera" multiline value={d.camera} onSave={(camera) => patch({ camera })} />
          </div>
          <div className="grid cols-2">
            <EditableList label="Regole visive" tone="ok" items={d.rules} onSave={(rules) => patch({ rules })} />
            <EditableList label="Da evitare" tone="alert" items={d.avoid} onSave={(avoid) => patch({ avoid })} />
          </div>
          {(d.why || d.limits) && (
            <div className="grid cols-2" style={{ marginTop: 16 }}>
              {d.why && <div><div className="label">Perché funziona</div><p>{d.why}</p></div>}
              {d.limits && <div><div className="label">Limiti</div><p>{d.limits}</p></div>}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="label" style={{ marginBottom: 8 }}>{d ? 'Altre proposte' : 'Proposte'}</div>
        <input className="input" style={{ marginBottom: 12 }} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Indicazione facoltativa (es. più sporco, meno digitale, niente neon)" />
        <AiRunner
          label={video.proposals.length || d ? 'Proponi altre 3 direzioni' : 'Proponi 3 direzioni'}
          build={() => directionsPrompt(
            buildVideoContext(video, project, track, 'directions'), note.trim(),
            [...video.proposals, ...(d ? [d] : [])].map((x) => `${x.name} (${x.logline})`),
          )}
          onResult={(text) => update({ proposals: [...video.proposals, ...parseDirections(text)] })}
        />
      </div>

      {video.proposals.length > 0 && (
        <div className="grid cols-2" style={{ marginTop: 16 }}>
          {video.proposals.map((p) => (
            <div key={p.id} className="card proposal">
              <h3 className="display" style={{ fontSize: '1.3rem' }}>{p.name}</h3>
              <p style={{ marginTop: 8 }}>{p.logline}</p>
              <div className="strip">{p.palette.map((c, i) => <span key={i} style={{ background: c.hex }} title={`${c.name} ${c.hex}`} />)}</div>
              <dl className="dl">
                <dt>Look</dt><dd>{p.look}</dd>
                <dt>Luce</dt><dd>{p.light}</dd>
                <dt>Camera</dt><dd>{p.camera}</dd>
                <dt>Perché funziona</dt><dd>{p.why}</dd>
                <dt>Limiti</dt><dd>{p.limits}</dd>
              </dl>
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn primary sm" type="button" onClick={() => choose(p)}>Scegli questa</button>
                <button className="btn danger sm" type="button" onClick={() => discard(p)}>Scarta</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
