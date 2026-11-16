import { useRef, useState } from 'react'
import AiRunner from '../AiRunner'
import { useApp } from '../AppState'
import { db, uid } from '../../lib/db'
import { storeImage } from '../../lib/video/hooks'
import { buildVideoContext, parseSheets, sheetsPrompt } from '../../lib/video/prompts'
import { SHEET_KINDS, type Sheet, type SheetKind } from '../../lib/video/types'
import { StepHead, StoredImage, TextField, type StepProps } from './common'

const LABELS: Record<SheetKind, { details: string; behavior: string }> = {
  personaggio: { details: 'Costume e accessori', behavior: 'Movimento e attitudine' },
  ambiente: { details: 'Arredo e materiali', behavior: 'Atmosfera' },
  oggetto: { details: 'Forma e stato', behavior: 'Come viene usato' },
}

export default function SheetsStep({ video, project, track, update }: StepProps) {
  const { toast } = useApp()
  const [openId, setOpenId] = useState<string | null>(null)

  const patch = (id: string, p: Partial<Sheet>) => update({ sheets: video.sheets.map((s) => (s.id === id ? { ...s, ...p } : s)) })

  function add(kind: SheetKind) {
    let name = `Nuovo ${kind}`
    for (let n = 2; video.sheets.some((x) => x.name === name); n++) name = `Nuovo ${kind} ${n}`
    const s: Sheet = { id: uid(), kind, name, role: '', look: '', details: '', colors: '', behavior: '', continuity: '' }
    update({ sheets: [...video.sheets, s] })
    setOpenId(s.id)
  }

  async function remove(s: Sheet) {
    const used = video.scenes.filter((sc) => sc.sheets.includes(s.name)).length
    if (!confirm(`Eliminare la scheda "${s.name}"?${used ? ` È usata in ${used} ${used === 1 ? 'scena' : 'scene'}.` : ''}`)) return
    if (s.imageId) await db.videoImages.delete(s.imageId)
    await update({ sheets: video.sheets.filter((x) => x.id !== s.id) })
  }

  /** Rinominare una scheda aggiorna anche le scene che la citano. */
  function rename(s: Sheet, name: string) {
    const clean = name.trim()
    if (!clean) return
    if (video.sheets.some((x) => x.id !== s.id && x.name.toLowerCase() === clean.toLowerCase())) {
      toast('Esiste già una scheda con questo nome', 'err'); return
    }
    update({
      sheets: video.sheets.map((x) => (x.id === s.id ? { ...x, name: clean } : x)),
      scenes: video.scenes.map((sc) => ({ ...sc, sheets: sc.sheets.map((n) => (n === s.name ? clean : n)) })),
    })
  }

  return (
    <section className="section">
      <StepHead num="04" title="Schede condivise"
        hint="Personaggi, ambienti e oggetti ricorrenti. Sono la fonte unica della coerenza: sceneggiatura, storyboard e prompt li richiamano per nome, sempre con la stessa descrizione." />

      {!video.direction && <div className="notice" style={{ marginBottom: 16 }}>Non hai ancora scelto una direzione artistica: le schede non potranno seguirne palette e regole.</div>}

      <div className="card">
        <AiRunner
          label={video.sheets.length ? 'Proponi le schede che mancano' : 'Proponi le schede dal concept'}
          build={() => sheetsPrompt(buildVideoContext(video, project, track, 'sheets'), video.sheets.map((s) => `${s.name} (${s.kind})`))}
          onResult={(text) => {
            const have = new Set(video.sheets.map((s) => s.name.toLowerCase()))
            const fresh = parseSheets(text).filter((s) => !have.has(s.name.toLowerCase()))
            if (!fresh.length) throw new Error('Le schede proposte esistono già tutte.')
            return update({ sheets: [...video.sheets, ...fresh] })
          }}
        />
        <div className="row" style={{ marginTop: 12 }}>
          <span className="label">Aggiungi a mano</span>
          {SHEET_KINDS.map((k) => <button key={k} className="btn sm" type="button" onClick={() => add(k)}>+ {k}</button>)}
        </div>
      </div>

      {video.sheets.length === 0 ? (
        <div className="empty" style={{ marginTop: 16 }}>Nessuna scheda. Senza schede ogni scena descriverebbe i personaggi a modo suo.</div>
      ) : SHEET_KINDS.map((k) => {
        const group = video.sheets.filter((s) => s.kind === k)
        if (!group.length) return null
        return (
          <div key={k} style={{ marginTop: 24 }}>
            <div className="label y" style={{ marginBottom: 8 }}>{k} · {group.length}</div>
            {group.map((s) => (
              <SheetCard key={s.id} sheet={s} videoId={video.id} open={openId === s.id}
                onToggle={() => setOpenId(openId === s.id ? null : s.id)}
                onPatch={(p) => patch(s.id, p)} onRename={(n) => rename(s, n)} onRemove={() => remove(s)} />
            ))}
          </div>
        )
      })}
    </section>
  )
}

function SheetCard({ sheet: s, videoId, open, onToggle, onPatch, onRename, onRemove }: {
  sheet: Sheet
  videoId: string
  open: boolean
  onToggle: () => void
  onPatch: (p: Partial<Sheet>) => void
  onRename: (name: string) => void
  onRemove: () => void
}) {
  const { toast } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const L = LABELS[s.kind]
  const filled = [s.look, s.details, s.colors, s.behavior, s.continuity].filter((x) => x.trim()).length

  async function setImage(f: File) {
    try {
      const { imageId } = await storeImage(videoId, f)
      if (s.imageId) await db.videoImages.delete(s.imageId)
      onPatch({ imageId })
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  return (
    <div className={`sheet ${open ? 'open' : ''}`}>
      <button type="button" className="sheet-head" onClick={onToggle} aria-expanded={open}>
        <StoredImage imageId={s.imageId} alt={s.name} className="sheet-thumb" />
        <span className="grow">
          <b>{s.name}</b>
          {s.role && <span className="dim"> — {s.role}</span>}
        </span>
        <span className={`tag ${filled === 5 ? 'y' : ''}`}>{filled}/5</span>
        <span className="mono y">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="sheet-body">
          <div className="grid cols-2">
            <TextField label="Nome (usato in sceneggiatura)" value={s.name} onSave={onRename} />
            <TextField label="Ruolo nel video" value={s.role} onSave={(role) => onPatch({ role })} />
          </div>
          <TextField label="Aspetto" multiline value={s.look} onSave={(look) => onPatch({ look })} />
          <div className="grid cols-2">
            <TextField label={L.details} multiline value={s.details} onSave={(details) => onPatch({ details })} />
            <TextField label={L.behavior} multiline value={s.behavior} onSave={(behavior) => onPatch({ behavior })} />
          </div>
          <TextField label="Colori" value={s.colors} onSave={(colors) => onPatch({ colors })} />
          <TextField label="Continuità — cosa non deve mai cambiare" multiline rows={2} value={s.continuity} onSave={(continuity) => onPatch({ continuity })} />
          <StoredImage imageId={s.imageId} alt={`Reference di ${s.name}`} className="sheet-img" />
          <div className="row">
            <button className="btn sm" type="button" onClick={() => fileRef.current?.click()}>{s.imageId ? 'Cambia immagine' : '+ Immagine di riferimento'}</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setImage(f); e.target.value = '' }} />
            <div className="spacer" />
            <button className="btn danger sm" type="button" onClick={onRemove}>Elimina scheda</button>
          </div>
        </div>
      )}
    </div>
  )
}
