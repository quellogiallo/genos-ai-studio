import { useRef, useState } from 'react'
import AiRunner from '../AiRunner'
import AiNotesList from '../AiNotesList'
import { useApp } from '../AppState'
import { db, uid, type Project } from '../../lib/db'
import { buildArtContext, moodPrompt } from '../../lib/art/prompts'
import type { ArtKit, MoodItem } from '../../lib/art/types'
import { paletteFit, storeArtImage } from '../../lib/art/utils'
import { StepHead, StoredImage } from '../video/common'
import { saveKit } from './IdentityTab'

/** Converte le immagini della moodboard in base64 ridotto (max 1024 px) per farle guardare all'AI. */
async function imagesForAi(items: MoodItem[]) {
  const out: { mime: string; base64: string }[] = []
  for (const m of items.slice(0, 12)) {
    const row = await db.videoImages.get(m.imageId)
    if (!row) continue
    const bmp = await createImageBitmap(row.blob)
    const s = Math.min(1, 1024 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close()
    out.push({ mime: 'image/jpeg', base64: c.toDataURL('image/jpeg', 0.8).split(',')[1] })
  }
  return out
}

export default function MoodTab({ kit, project }: { kit: ArtKit; project: Project }) {
  const { toast } = useApp()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const palette = kit.identity?.palette.map((p) => p.hex) ?? []

  async function add(files: FileList) {
    setBusy(true)
    const items: MoodItem[] = []
    for (const f of Array.from(files)) {
      try {
        const { imageId, colors } = await storeArtImage(kit.id, f)
        items.push({ id: uid(), imageId, note: '', colors, fit: palette.length ? paletteFit(colors, palette) : undefined })
      } catch (e) { toast((e as Error).message, 'err') }
    }
    await saveKit(kit, { mood: [...kit.mood, ...items] })
    setBusy(false)
  }
  const patch = (id: string, p: Partial<MoodItem>) => saveKit(kit, { mood: kit.mood.map((m) => (m.id === id ? { ...m, ...p } : m)) })
  // ricalcola la vicinanza se la palette cambia
  const fitOf = (m: MoodItem) => (palette.length ? paletteFit(m.colors, palette) : undefined)

  return (
    <section className="section">
      <StepHead num="A2" title="Moodboard di progetto" hint="Immagini di riferimento per tutto il progetto. L'app misura i colori dominanti di ogni immagine e quanto sono vicini alla palette dell'identità. Con una chiave API l'AI guarda davvero le immagini; con “Copia per Claude” riceve solo note e colori." />
      <div className="card">
        <button className="btn primary sm" type="button" disabled={busy} onClick={() => file.current?.click()}>{busy ? <><div className="spinner" /> Carico…</> : 'Aggiungi immagini'}</button>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = '' }} />
        <div className="label" style={{ marginTop: 8 }}>Le immagini restano su questo dispositivo (non si sincronizzano); note e colori sì.</div>
      </div>

      {kit.mood.length > 0 && (
        <div className="mood-grid section">
          {kit.mood.map((m, k) => {
            const fit = fitOf(m)
            return (
              <div key={m.id} className="mood-item">
                <div style={{ position: 'relative' }}>
                  <StoredImage imageId={m.imageId} alt={m.note || `Immagine ${k + 1}`} className="mood-img" />
                  <span className="shot-code">{k + 1}</span>
                </div>
                <div className="mood-cols">{m.colors.map((c) => <span key={c} style={{ background: c }} title={c} />)}</div>
                {fit !== undefined && <div className="label" style={{ color: fit >= 0.6 ? 'var(--green)' : fit >= 0.35 ? 'var(--y)' : 'var(--red)' }}>vicinanza alla palette {Math.round(fit * 100)}%</div>}
                <input className="input" style={{ fontSize: 13, padding: 6 }} defaultValue={m.note} placeholder="Perché è qui?" onBlur={(e) => e.target.value !== m.note && patch(m.id, { note: e.target.value })} />
                <button className="btn ghost sm" type="button" onClick={async () => { await db.videoImages.delete(m.imageId); await saveKit(kit, { mood: kit.mood.filter((x) => x.id !== m.id) }) }}>Togli</button>
              </div>
            )
          })}
        </div>
      )}

      {kit.mood.length > 0 && (
        <div className="card section">
          {!kit.identity && <div className="notice" style={{ marginBottom: 10 }}>Scegli prima un'identità (A1): la critica confronta la moodboard con quella.</div>}
          <AiRunner label="Critica la moodboard" disabledReason={kit.identity ? undefined : 'Serve un\'identità scelta.'}
            build={async () => {
              const withFit = { ...kit, mood: kit.mood.map((m) => ({ ...m, fit: fitOf(m) })) }
              const images = await imagesForAi(kit.mood)
              return { ...moodPrompt(await buildArtContext(project), withFit, images.length > 0), images }
            }}
            onResult={async (t) => { if (!t.trim()) throw new Error('Risposta vuota.'); await db.aiNotes.add({ id: uid(), scope: 'project', refId: kit.id, kind: 'moodboard-critica', userNote: 'Critica della moodboard', markdown: t.trim(), createdAt: Date.now() }) }} />
          <AiNotesList refId={kit.id} kinds={['moodboard-critica']} />
        </div>
      )}
    </section>
  )
}
