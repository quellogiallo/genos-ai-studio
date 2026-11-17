import { useState } from 'react'
import { Link } from 'react-router-dom'
import AiRunner from '../AiRunner'
import { useApp } from '../AppState'
import { db, type Project } from '../../lib/db'
import { applyIdentityToProject, buildArtContext, identityPrompt, parseIdentities } from '../../lib/art/prompts'
import { FONTS, type ArtKit, type FontName, type Identity } from '../../lib/art/types'
import { contrast } from '../../lib/art/utils'
import { EditableList, StepHead, TextField } from '../video/common'

export const saveKit = async (k: ArtKit, p: Partial<ArtKit>): Promise<void> => { await db.artkits.update(k.id, { ...p, updatedAt: Date.now() }) }

/** Anteprima di un'identità: palette, font, wordmark. */
export function IdentityPreview({ i, big }: { i: Identity; big?: boolean }) {
  const bg = i.palette.find((p) => /sfondo|background|base/i.test(p.role))?.hex ?? i.palette[0].hex
  const ink = [...i.palette].sort((a, b) => contrast(b.hex, bg) - contrast(a.hex, bg))[0].hex
  const accent = i.palette.find((p) => /accent/i.test(p.role))?.hex ?? i.palette[2]?.hex ?? ink
  return (
    <div className="id-prev" style={{ background: bg, color: ink, minHeight: big ? 220 : 150 }}>
      <div style={{ fontFamily: `"${i.fontDisplay}"`, fontWeight: 800, fontSize: big ? 64 : 40, lineHeight: 0.9, letterSpacing: '-0.02em' }}>GENOS</div>
      <div style={{ fontFamily: `"${i.fontText}"`, fontSize: 13, marginTop: 8, maxWidth: 340 }}>{i.concept.slice(0, 120)}</div>
      <div className="id-bar" style={{ background: accent }} />
      <div className="id-sw">{i.palette.map((p) => <span key={p.hex + p.role} style={{ background: p.hex }} title={`${p.name} ${p.hex} · ${p.role}`} />)}</div>
    </div>
  )
}

export default function IdentityTab({ kit, project }: { kit: ArtKit; project: Project }) {
  const { toast } = useApp()
  const [note, setNote] = useState('')
  const i = kit.identity

  async function choose(p: Identity) {
    const others = kit.proposals.filter((x) => x.name !== p.name).map((x) => x.name)
    await saveKit(kit, { identity: p, discarded: [...new Set([...kit.discarded, ...others])] })
    await applyIdentityToProject(project, p, others)
    toast('Identità scelta: ora tutti i moduli la rispettano')
  }
  const set = async (p: Partial<Identity>) => {
    if (!i) return
    const next = { ...i, ...p }
    await saveKit(kit, { identity: next })
    await applyIdentityToProject(project, next, [])
  }

  const bgHex = i?.palette.find((p) => /sfondo|background|base/i.test(p.role))?.hex ?? i?.palette[0]?.hex

  return (
    <section className="section">
      <StepHead num="A1" title="Identità visiva e sonora" hint="L'AI propone 3 direzioni diverse; quella che scegli diventa l'identità del progetto e una decisione vincolante per Music, Video e Content Lab. Le altre finiscono tra le idee scartate." />

      <div className="card">
        <input className="input" style={{ marginBottom: 10 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Indicazione facoltativa (es. qualcosa di minerale, freddo, che richiami l'ambra fossile)" />
        <AiRunner label={kit.proposals.length ? 'Proponi altre 3 direzioni' : 'Proponi 3 direzioni'}
          build={async () => identityPrompt(await buildArtContext(project), note.trim(), [...kit.discarded, ...kit.proposals.map((p) => p.name)])}
          onResult={async (t) => saveKit(kit, { proposals: parseIdentities(t), discarded: [...new Set([...kit.discarded, ...kit.proposals.filter((p) => p.name !== i?.name).map((p) => p.name)])] })} />
      </div>

      {kit.proposals.length > 0 && (
        <div className="grid cols-3 section" style={{ gap: 14 }}>
          {kit.proposals.map((p) => {
            const chosen = i?.name === p.name
            return (
              <div key={p.name} className={`card ${chosen ? 'chosen' : ''}`} style={{ padding: 0 }}>
                <IdentityPreview i={p} />
                <div style={{ padding: 14 }}>
                  <b className="y">{p.name}</b>
                  <p style={{ fontSize: 13, margin: '6px 0' }}>{p.concept}</p>
                  <div className="label">{p.fontDisplay} + {p.fontText} · {p.keywords.slice(0, 4).join(', ')}</div>
                  <p className="dim" style={{ fontSize: 12 }}><b>Perché:</b> {p.why}<br /><b>Limiti:</b> {p.limits}</p>
                  {chosen ? <span className="tag solid">Scelta</span> : <button className="btn primary sm" type="button" onClick={() => choose(p)}>Scegli questa</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {i && (
        <div className="section">
          <IdentityPreview i={i} big />
          <div className="row" style={{ marginTop: 10 }}>
            <Link className="btn ghost sm" to="/art/brandbook">Brand book (stampa / PDF) →</Link>
          </div>
          <TextField label="Nome" value={i.name} onSave={(name) => name.trim() && set({ name: name.trim() })} />
          <TextField label="Concetto" multiline rows={3} value={i.concept} onSave={(concept) => set({ concept })} />

          <div className="label" style={{ margin: '14px 0 6px' }}>Palette · tocca un colore per cambiarlo</div>
          <div className="pal-edit">
            {i.palette.map((p, k) => {
              const c = bgHex ? contrast(p.hex, bgHex) : 1
              return (
                <div key={k} className="pal-item">
                  <label className="pal-sw" style={{ background: p.hex }}><input type="color" value={p.hex} onChange={(e) => set({ palette: i.palette.map((x, j) => (j === k ? { ...x, hex: e.target.value } : x)) })} aria-label={`Colore ${p.name}`} /></label>
                  <b style={{ fontSize: 13 }}>{p.name}</b>
                  <span className="mono" style={{ fontSize: 11 }}>{p.hex}</span>
                  <span className="label">{p.role}</span>
                  {p.hex !== bgHex && <span className="label" style={{ color: c >= 4.5 ? 'var(--green)' : c >= 3 ? 'var(--y)' : 'var(--red)' }}>contrasto {c.toFixed(1)}{c >= 4.5 ? ' ✓ testo' : c >= 3 ? ' solo titoli' : ' non leggibile'}</span>}
                </div>
              )
            })}
          </div>

          <div className="row" style={{ marginTop: 14, alignItems: 'stretch' }}>
            <label className="field" style={{ flex: '1 1 200px' }}><span className="label">Font titoli</span>
              <select className="select" value={i.fontDisplay} onChange={(e) => set({ fontDisplay: e.target.value as FontName })} style={{ fontFamily: `"${i.fontDisplay}"` }}>
                {FONTS.map((f) => <option key={f.name} value={f.name}>{f.name} — {f.kind}</option>)}
              </select></label>
            <label className="field" style={{ flex: '1 1 200px' }}><span className="label">Font testi</span>
              <select className="select" value={i.fontText} onChange={(e) => set({ fontText: e.target.value as FontName })} style={{ fontFamily: `"${i.fontText}"` }}>
                {FONTS.map((f) => <option key={f.name} value={f.name}>{f.name} — {f.kind}</option>)}
              </select></label>
          </div>
          <div className="type-sample" style={{ fontFamily: `"${i.fontDisplay}"` }}>Ogni suono lascia una forma</div>
          <div className="type-sample small" style={{ fontFamily: `"${i.fontText}"` }}>Nuovo singolo · 15 dicembre · tutte le piattaforme</div>

          <div className="grid cols-2 section" style={{ gap: 16 }}>
            <EditableList label="Regole tipografiche" items={i.typeRules} onSave={(typeRules) => set({ typeRules })} />
            <EditableList label="Parole chiave" items={i.keywords} onSave={(keywords) => set({ keywords })} />
          </div>
          <TextField label="Logo / wordmark" multiline rows={3} value={i.logo} onSave={(logo) => set({ logo })} />
          <TextField label="Immagini: foto e render 3D" multiline rows={3} value={i.imagery} onSave={(imagery) => set({ imagery })} />
          <TextField label="Layout e griglie" multiline rows={2} value={i.layout} onSave={(layout) => set({ layout })} />
          <div className="grid cols-2" style={{ gap: 16 }}>
            <EditableList label="Regole" items={i.rules} onSave={(rules) => set({ rules })} tone="ok" />
            <EditableList label="Da evitare" items={i.avoid} onSave={(avoid) => set({ avoid })} tone="alert" />
          </div>

          <div className="section-head section"><span className="num">♪</span><h2 className="display" style={{ fontSize: '1.1rem' }}>Identità sonora</h2></div>
          <div className="grid cols-2" style={{ gap: 16 }}>
            <EditableList label="Suoni firma" items={i.sonic.signature} onSave={(signature) => set({ sonic: { ...i.sonic, signature } })} />
            <EditableList label="Regole di mix" items={i.sonic.mixRules} onSave={(mixRules) => set({ sonic: { ...i.sonic, mixRules } })} />
            <EditableList label="Regole di arrangiamento" items={i.sonic.arrangement} onSave={(arrangement) => set({ sonic: { ...i.sonic, arrangement } })} />
            <EditableList label="Da evitare nel suono" items={i.sonic.avoid} onSave={(avoid) => set({ sonic: { ...i.sonic, avoid } })} tone="alert" />
          </div>
        </div>
      )}
    </section>
  )
}
