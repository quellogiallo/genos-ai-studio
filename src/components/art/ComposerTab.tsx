import { useEffect, useRef, useState } from 'react'
import { useApp } from '../AppState'
import { db, uid } from '../../lib/db'
import { checkArtwork, renderArtwork } from '../../lib/art/render'
import { FORMATS, type ArtConcept, type ArtFormat, type ArtKit, type ArtLayout, type Artwork } from '../../lib/art/types'
import { contrast, ensureFonts, storeArtImage } from '../../lib/art/utils'
import { StepHead } from '../video/common'
import { saveKit } from './IdentityTab'

const LAYOUTS: ArtLayout[] = ['centrato', 'griglia', 'bordo', 'diagonale', 'tipografico']

export function newArtwork(kit: ArtKit, format: ArtFormat, concept?: ArtConcept): Artwork {
  const pal = kit.identity?.palette ?? [{ hex: '#0a0a0a', role: 'sfondo', name: '' }, { hex: '#f2f2ee', role: 'testo', name: '' }, { hex: '#ffd400', role: 'accento', name: '' }]
  const bg = pal.find((p) => /sfondo|background|base/i.test(p.role))?.hex ?? pal[0].hex
  const ink = [...pal].sort((a, b) => contrast(b.hex, bg) - contrast(a.hex, bg))[0].hex
  const accent = pal.find((p) => /accent/i.test(p.role))?.hex ?? pal.find((p) => p.hex !== bg && p.hex !== ink)?.hex ?? ink
  return {
    id: uid(), format, name: concept?.title ?? FORMATS[format].label, layout: concept?.layoutHint ?? (format === 'merch' ? 'tipografico' : 'centrato'),
    bg, ink, accent, imageFit: 'cover', imageOpacity: 1, imageGray: false,
    title: 'GENOS', subtitle: '', small: '', titleScale: 1, grain: 0.2, transparent: format === 'merch', conceptId: concept?.id, updatedAt: Date.now(),
  }
}

function useBitmap(imageId?: string) {
  const [bmp, setBmp] = useState<ImageBitmap | null>(null)
  useEffect(() => {
    let alive = true
    setBmp(null)
    if (imageId) db.videoImages.get(imageId).then(async (r) => { if (r && alive) setBmp(await createImageBitmap(r.blob)) })
    return () => { alive = false }
  }, [imageId])
  return bmp
}

export default function ComposerTab({ kit, openId, setOpenId }: { kit: ArtKit; openId: string | null; setOpenId: (id: string | null) => void }) {
  const a = kit.artworks.find((x) => x.id === openId)
  return (
    <section className="section">
      <StepHead num="A4" title="Compositore" hint="Componi l'artwork con palette e font dell'identità, una tua foto o un render, e scaricalo come PNG alle misure esatte del formato. L'anteprima è identica al file finale." />
      <div className="pills">
        {(Object.keys(FORMATS) as ArtFormat[]).map((f) => (
          <button key={f} type="button" className="chip" onClick={async () => { const n = newArtwork(kit, f); await saveKit(kit, { artworks: [n, ...kit.artworks] }); setOpenId(n.id) }}>+ {FORMATS[f].label}</button>
        ))}
      </div>
      {!kit.identity && <div className="notice" style={{ marginTop: 12 }}>Senza un'identità scelta (A1) il compositore usa colori e font di base.</div>}

      {a ? <Editor key={a.id} kit={kit} a={a} close={() => setOpenId(null)} /> : (
        <div className="art-list section">
          {kit.artworks.length === 0 && <div className="empty">Nessun artwork. Scegli un formato qui sopra, oppure apri un concept da A3.</div>}
          {kit.artworks.map((x) => (
            <button key={x.id} type="button" className="art-card" onClick={() => setOpenId(x.id)}>
              <Thumb kit={kit} a={x} />
              <b>{x.name}</b><span className="label">{FORMATS[x.format].label}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function Thumb({ kit, a }: { kit: ArtKit; a: Artwork }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const bmp = useBitmap(a.imageId)
  useEffect(() => {
    const f = FORMATS[a.format], w = 220, h = Math.round((w * f.h) / f.w)
    const c = ref.current!; c.width = w; c.height = h
    ensureFonts([kit.identity?.fontDisplay ?? 'Archivo', kit.identity?.fontText ?? 'Inter Tight']).then(() => renderArtwork(c.getContext('2d')!, a, w, h, kit.identity, bmp))
  }, [a, bmp, kit.identity])
  return <canvas ref={ref} className="art-thumb" />
}

function Editor({ kit, a, close }: { kit: ArtKit; a: Artwork; close: () => void }) {
  const { toast } = useApp()
  const ref = useRef<HTMLCanvasElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const bmp = useBitmap(a.imageId)
  const [guides, setGuides] = useState(true)
  const [busy, setBusy] = useState('')
  const f = FORMATS[a.format]
  const set = (p: Partial<Artwork>) => saveKit(kit, { artworks: kit.artworks.map((x) => (x.id === a.id ? { ...x, ...p, updatedAt: Date.now() } : x)) })
  const pal = kit.identity?.palette ?? []

  useEffect(() => {
    const c = ref.current!
    const w = Math.min(900, c.parentElement!.clientWidth) * (window.devicePixelRatio > 1 ? 2 : 1)
    const h = Math.round((w * f.h) / f.w)
    c.width = w; c.height = h
    ensureFonts([kit.identity?.fontDisplay ?? 'Archivo', kit.identity?.fontText ?? 'Inter Tight']).then(() => renderArtwork(c.getContext('2d')!, a, w, h, kit.identity, bmp, { guides }))
  }, [a, bmp, kit.identity, guides, f.w, f.h])

  async function upload(fl: File) {
    setBusy('Carico l\'immagine…')
    try {
      const { imageId } = await storeArtImage(kit.id, fl, Math.max(f.w, f.h))
      if (a.imageId) await db.videoImages.delete(a.imageId)
      await set({ imageId })
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy('') }
  }

  async function exportPng() {
    setBusy(`Creo il PNG ${f.w}×${f.h}…`)
    try {
      await ensureFonts([kit.identity?.fontDisplay ?? 'Archivo', kit.identity?.fontText ?? 'Inter Tight'])
      const c = document.createElement('canvas'); c.width = f.w; c.height = f.h
      renderArtwork(c.getContext('2d')!, a, f.w, f.h, kit.identity, bmp)
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
      if (!blob) throw new Error('Il browser non è riuscito a creare il file (memoria insufficiente?).')
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${(a.name || 'artwork').replace(/[^\w\- ]+/g, '').trim() || 'artwork'}-${f.w}x${f.h}.png`
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 10000)
      toast(`PNG ${f.w}×${f.h} scaricato (${(blob.size / 1048576).toFixed(1)} MB)`)
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy('') }
  }

  const checks = checkArtwork(a, bmp)
  const Color = ({ label, k }: { label: string; k: 'bg' | 'ink' | 'accent' }) => (
    <div className="row" style={{ gap: 6 }}>
      <span className="label" style={{ width: 64 }}>{label}</span>
      {pal.map((p) => <button key={p.hex + p.role} type="button" className={`swatch-btn ${a[k] === p.hex ? 'on' : ''}`} style={{ background: p.hex }} title={`${p.name} ${p.hex}`} onClick={() => set({ [k]: p.hex })} />)}
      <label className="swatch-btn custom" style={{ background: a[k] }}><input type="color" value={a[k]} onChange={(e) => set({ [k]: e.target.value })} aria-label={`${label}: colore libero`} /></label>
    </div>
  )

  return (
    <div className="composer section">
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn ghost sm" type="button" onClick={close}>← Tutti gli artwork</button>
        <input className="input" style={{ flex: '1 1 160px', padding: 6, fontSize: 14 }} value={a.name} onChange={(e) => set({ name: e.target.value })} aria-label="Nome artwork" />
        <span className="label">{f.label}</span>
      </div>
      <div className="comp-grid">
        <div>
          <div className="comp-canvas"><canvas ref={ref} /></div>
          <label className="row" style={{ gap: 6, marginTop: 6, fontSize: 13 }}><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} style={{ accentColor: 'var(--y)' }} />Mostra zone sicure (non finiscono nel file)</label>
          <div style={{ marginTop: 10 }}>{checks.map((c, i) => <div key={i} className={`check ${c.level}`} style={{ padding: '6px 0' }}><div className="check-dot" /><div className="grow" style={{ fontSize: 13 }}>{c.text}</div></div>)}</div>
        </div>
        <div className="comp-panel">
          <div className="label">Layout</div>
          <div className="pills" style={{ marginBottom: 12 }}>{LAYOUTS.map((l) => <button key={l} type="button" className={`chip ${a.layout === l ? 'on' : ''}`} onClick={() => set({ layout: l })}>{l}</button>)}</div>
          <textarea className="textarea" rows={2} value={a.title} onChange={(e) => set({ title: e.target.value })} placeholder="Titolo (a capo = nuova riga)" style={{ minHeight: 60 }} />
          <input className="input" style={{ marginTop: 8 }} value={a.subtitle} onChange={(e) => set({ subtitle: e.target.value })} placeholder="Sottotitolo (es. nome del brano)" />
          <input className="input" style={{ marginTop: 8 }} value={a.small} onChange={(e) => set({ small: e.target.value })} placeholder="Testo piccolo (data, luogo, crediti)" />
          <label className="row" style={{ marginTop: 10, gap: 8 }}><span className="label" style={{ width: 64 }}>Titolo</span><input type="range" min={0.5} max={2} step={0.05} value={a.titleScale} onChange={(e) => set({ titleScale: Number(e.target.value) })} style={{ flex: 1, accentColor: 'var(--y)' }} /></label>
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}><Color label="Sfondo" k="bg" /><Color label="Testo" k="ink" /><Color label="Accento" k="accent" /></div>

          <div className="label" style={{ marginTop: 14 }}>Immagine (tua foto o render)</div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn sm" type="button" disabled={!!busy} onClick={() => file.current?.click()}>{a.imageId ? 'Cambia' : 'Carica'}</button>
            {a.imageId && <button className="btn ghost sm" type="button" onClick={async () => { await db.videoImages.delete(a.imageId!); set({ imageId: undefined }) }}>Togli</button>}
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const fl = e.target.files?.[0]; if (fl) upload(fl); e.target.value = '' }} />
          </div>
          {a.imageId && <>
            <div className="pills" style={{ marginTop: 8 }}>
              <button type="button" className={`chip ${a.imageFit === 'cover' ? 'on' : ''}`} onClick={() => set({ imageFit: 'cover' })}>Riempi</button>
              <button type="button" className={`chip ${a.imageFit === 'contain' ? 'on' : ''}`} onClick={() => set({ imageFit: 'contain' })}>Intera</button>
              <button type="button" className={`chip ${a.imageGray ? 'on' : ''}`} onClick={() => set({ imageGray: !a.imageGray })}>Bianco e nero</button>
            </div>
            <label className="row" style={{ marginTop: 8, gap: 8 }}><span className="label" style={{ width: 64 }}>Opacità</span><input type="range" min={0.1} max={1} step={0.05} value={a.imageOpacity} onChange={(e) => set({ imageOpacity: Number(e.target.value) })} style={{ flex: 1, accentColor: 'var(--y)' }} /></label>
          </>}
          <label className="row" style={{ marginTop: 8, gap: 8 }}><span className="label" style={{ width: 64 }}>Grana</span><input type="range" min={0} max={1} step={0.05} value={a.grain} onChange={(e) => set({ grain: Number(e.target.value) })} style={{ flex: 1, accentColor: 'var(--y)' }} /></label>
          {a.format === 'merch' && <label className="row" style={{ gap: 6, marginTop: 8, fontSize: 13 }}><input type="checkbox" checked={a.transparent} onChange={(e) => set({ transparent: e.target.checked })} style={{ accentColor: 'var(--y)' }} />Sfondo trasparente</label>}

          <button className="btn primary" type="button" style={{ marginTop: 16, width: '100%' }} disabled={!!busy} onClick={exportPng}>{busy ? <><div className="spinner" /> {busy}</> : `Scarica PNG ${f.w}×${f.h}`}</button>
          <div className="label" style={{ marginTop: 6 }}>{f.note}</div>
          <button className="btn danger sm" type="button" style={{ marginTop: 14 }} onClick={async () => { if (confirm('Eliminare questo artwork?')) { if (a.imageId) await db.videoImages.delete(a.imageId); await saveKit(kit, { artworks: kit.artworks.filter((x) => x.id !== a.id) }); close() } }}>Elimina artwork</button>
        </div>
      </div>
    </div>
  )
}
