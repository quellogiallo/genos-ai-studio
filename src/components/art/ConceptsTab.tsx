import { useState } from 'react'
import AiRunner from '../AiRunner'
import type { Project } from '../../lib/db'
import { buildArtContext, conceptPrompt, parseConcepts } from '../../lib/art/prompts'
import { FORMATS, type ArtConcept, type ArtFormat, type ArtKit } from '../../lib/art/types'
import { StepHead } from '../video/common'
import { newArtwork } from './ComposerTab'
import { saveKit } from './IdentityTab'

export default function ConceptsTab({ kit, project, openComposer }: { kit: ArtKit; project: Project; openComposer: (artworkId: string) => void }) {
  const [format, setFormat] = useState<ArtFormat>('cover')
  const [n, setN] = useState(3)
  const [brief, setBrief] = useState('')

  async function toComposer(c: ArtConcept) {
    const a = newArtwork(kit, c.format, c)
    await saveKit(kit, { artworks: [a, ...kit.artworks] })
    openComposer(a.id)
  }

  return (
    <section className="section">
      <StepHead num="A3" title="Concept per artwork" hint="Idee per copertine, grafiche social, locandine e merch, coerenti con l'identità. Ognuna dice come ottenere l'immagine con le tue foto, un render 3D o solo grafica, e si apre come bozza nel compositore." />
      {!kit.identity ? <div className="notice">Scegli prima un'identità (A1).</div> : (
        <div className="card">
          <div className="pills" style={{ marginBottom: 10 }}>{(Object.keys(FORMATS) as ArtFormat[]).map((f) => <button key={f} type="button" className={`chip ${format === f ? 'on' : ''}`} onClick={() => setFormat(f)}>{FORMATS[f].label}</button>)}</div>
          <input className="input" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Facoltativo: per cosa? Es. «copertina del singolo», «locandina live al circolo, 20 gennaio»" />
          <div className="row" style={{ marginTop: 10 }}><span className="label">Quanti</span>{[2, 3, 4].map((k) => <button key={k} type="button" className={`chip ${n === k ? 'on' : ''}`} onClick={() => setN(k)}>{k}</button>)}</div>
          <div style={{ marginTop: 12 }}>
            <AiRunner label="Genera concept" build={async () => conceptPrompt(await buildArtContext(project), kit, format, n, brief.trim())}
              onResult={async (t) => saveKit(kit, { concepts: [...parseConcepts(t, format), ...kit.concepts] })} />
          </div>
        </div>
      )}

      <div className="section">
        {kit.concepts.map((c) => (
          <article key={c.id} className="idea">
            <div className="row" style={{ gap: 8 }}><span className="tag solid">{FORMATS[c.format].label.split(' ')[0]}</span><span className="tag y">{c.imageSource || 'immagine'}</span><span className="tag">layout {c.layoutHint}</span></div>
            <h3 className="display" style={{ fontSize: '1.15rem', margin: '10px 0 6px' }}>{c.title}</h3>
            <p style={{ fontSize: 14, margin: '4px 0' }}>{c.idea}</p>
            <p className="md-field" style={{ fontSize: 13 }}><b className="y">Composizione:</b> {c.composition}</p>
            <p className="md-field" style={{ fontSize: 13 }}><b className="y">Colori:</b> {c.colorUse}</p>
            <p className="md-field" style={{ fontSize: 13 }}><b className="y">Tipografia:</b> {c.typography}</p>
            {c.shotOr3d && <p className="md-field" style={{ fontSize: 13 }}><b className="y">Come ottenere l'immagine:</b> {c.shotOr3d}</p>}
            <p className="dim" style={{ fontSize: 12 }}><b>Perché:</b> {c.why} · <b>Limiti:</b> {c.limits}</p>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sm" type="button" onClick={() => toComposer(c)}>Apri come bozza nel compositore →</button>
              <button className="btn ghost sm" type="button" aria-label="Elimina concept" onClick={() => confirm('Eliminare questo concept?') && saveKit(kit, { concepts: kit.concepts.filter((x) => x.id !== c.id) })}>×</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
