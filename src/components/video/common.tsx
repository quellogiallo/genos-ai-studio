import { useState } from 'react'
import { useImageUrl } from '../../lib/video/hooks'
import { inkOn } from '../../lib/video/palette'
import type { PaletteColor, VideoProject } from '../../lib/video/types'
import type { Project } from '../../lib/db'
import type { TrackInfo } from '../../lib/video/prompts'

/** Ciò che ogni passo del workflow riceve. */
export interface StepProps {
  video: VideoProject
  project: Project
  track: TrackInfo | undefined
  update: (patch: Partial<VideoProject>) => Promise<void>
}

/** Campo di testo che salva quando esci dal campo. */
export function TextField({ label, value, onSave, multiline, rows = 3, placeholder, mono }: {
  label?: string
  value: string
  onSave: (v: string) => void
  multiline?: boolean
  rows?: number
  placeholder?: string
  mono?: boolean
}) {
  const [v, setV] = useState(value)
  // se il valore salvato cambia da fuori (es. risposta AI), il campo si riallinea
  const [seen, setSeen] = useState(value)
  if (seen !== value) { setSeen(value); setV(value) }
  const commit = () => { if (v !== value) onSave(v) }
  const cls = `${multiline ? 'textarea' : 'input'}${mono ? ' mono' : ''}`
  return (
    <label className="field">
      {label && <span className="label">{label}</span>}
      {multiline
        ? <textarea className={cls} rows={rows} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} />
        : <input className={cls} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} />}
    </label>
  )
}

/** Input compatto (dentro una riga) che salva quando esci dal campo. */
export function InlineInput({ value, onSave, placeholder, style, type, min }: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
  style?: React.CSSProperties
  type?: string
  min?: number
}) {
  const [v, setV] = useState(value)
  // se il valore salvato cambia da fuori (es. risposta AI), il campo si riallinea
  const [seen, setSeen] = useState(value)
  if (seen !== value) { setSeen(value); setV(value) }
  return (
    <input className="input" type={type} min={min} style={style} value={v} placeholder={placeholder} aria-label={placeholder}
      onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== value) onSave(v) }} />
  )
}

/** Lista di frasi modificabile (regole, debolezze…). */
export function EditableList({ label, items, onSave, placeholder, tone }: {
  label: string
  items: string[]
  onSave: (items: string[]) => void
  placeholder?: string
  tone?: 'ok' | 'warn' | 'alert'
}) {
  const [text, setText] = useState('')
  return (
    <div className="elist">
      <div className="label">{label}</div>
      {items.map((it, i) => (
        <div key={i + it} className={`check ${tone ?? 'info'}`}>
          <div className="check-dot" />
          <div className="grow" style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{it}</div>
          <button className="btn ghost sm" type="button" aria-label="Rimuovi" onClick={() => onSave(items.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <form className="row" style={{ marginTop: 8, alignItems: 'stretch' }}
        onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; onSave([...items, text.trim()]); setText('') }}>
        <input className="input" style={{ flex: '1 1 200px' }} value={text} placeholder={placeholder ?? 'Aggiungi'} onChange={(e) => setText(e.target.value)} />
        <button className="btn sm" disabled={!text.trim()}>+</button>
      </form>
    </div>
  )
}

export function Swatches({ palette }: { palette: PaletteColor[] }) {
  if (!palette.length) return null
  return (
    <div className="swatches">
      {palette.map((c, i) => (
        <div key={i + c.hex} className="swatch" style={{ background: c.hex, color: inkOn(c.hex) }}>
          <b>{c.name || c.hex}</b>
          <span className="mono">{c.hex}</span>
          {c.role && <span className="swatch-role">{c.role}</span>}
        </div>
      ))}
    </div>
  )
}

export function Chips({ colors }: { colors: string[] | undefined }) {
  if (!colors?.length) return null
  return <div className="chips" title="Colori dominanti misurati dall'immagine">{colors.map((c) => <span key={c} style={{ background: c }} />)}</div>
}

export function StoredImage({ imageId, alt, className }: { imageId: string | undefined; alt: string; className?: string }) {
  const url = useImageUrl(imageId)
  if (!imageId) return null
  if (url === null) return <div className={`${className ?? ''} img-wait img-missing`} title="Immagine salvata su un altro dispositivo">Immagine su un altro dispositivo</div>
  if (!url) return <div className={`${className ?? ''} img-wait`}><div className="spinner" /></div>
  return <img className={className} src={url} alt={alt} loading="lazy" />
}

export function StepHead({ num, title, hint }: { num: string; title: string; hint: string }) {
  return (
    <>
      <div className="section-head">
        <span className="num">{num}</span>
        <h2 className="display" style={{ fontSize: '1.2rem' }}>{title}</h2>
      </div>
      <p className="dim" style={{ marginTop: -6, fontSize: 13 }}>{hint}</p>
    </>
  )
}
