import { useRef, useState } from 'react'
import { uid } from '../../lib/db'
import { storeImage } from '../../lib/video/hooks'
import { SHOT_SIZES, fmtDur, type Scene, type Shot, type ShotSize, type VideoProject, type VideoTechnique } from '../../lib/video/types'
import { useApp } from '../AppState'
import { InlineInput, StoredImage, TextField } from './common'

/* ---------------- utilità condivise da storyboard, shot list, riprese ---------------- */

export const shotsOf = (v: VideoProject, sceneId: string) => (v.shots ?? []).filter((s) => s.sceneId === sceneId)

export function codeMap(v: VideoProject): Map<string, string> {
  const m = new Map<string, string>()
  v.scenes.forEach((sc, i) => shotsOf(v, sc.id).forEach((t, j) => m.set(t.id, `${i + 1}.${j + 1}`)))
  return m
}

export function newShot(sceneId: string, technique: VideoTechnique): Shot {
  return { id: uid(), sceneId, size: 'totale', angle: '', movement: '', lens: '', light: '', description: '', durationSec: 0, transition: '', sheets: [], technique, sound: '', prompt: '', note3d: '' }
}

/* ---------------- schema dell'inquadratura (quando non c'è un'immagine) ---------------- */

const SCALE: Record<ShotSize, number> = {
  'campo lunghissimo': 0.14, 'campo lungo': 0.24, totale: 0.42, 'figura intera': 0.8, 'piano americano': 1.15,
  'mezza figura': 1.6, 'primo piano': 2.6, 'primissimo piano': 3.8, dettaglio: 7,
}

/** Disegno schematico: quanto spazio occupa una figura nel fotogramma + movimento di camera. */
export function FramingGlyph({ size, movement, angle }: { size: ShotSize; movement: string; angle: string }) {
  const k = SCALE[size] ?? 0.42
  // figura alta 80 unità a scala 1; testa a 1/3 dell'altezza del fotogramma per i piani stretti
  const h = 80 * k
  const headR = h * 0.09
  const cx = 80
  const headY = k >= 1.15 ? 30 : 90 - h + headR
  const m = movement.toLowerCase(), a = angle.toLowerCase()
  const low = /basso/.test(a), high = /alto|zenit/.test(a)
  return (
    <svg viewBox="0 0 160 90" className="glyph" role="img" aria-label={`${size}${movement ? `, ${movement}` : ''}`}>
      <rect x="0" y="0" width="160" height="90" fill="#141414" />
      <line x1="0" y1="80" x2="160" y2="80" stroke="#2a2a2a" />
      <g transform={low ? 'translate(0,4) scale(1,0.96)' : high ? 'translate(0,-2) scale(1,1.02)' : undefined} fill="#3c3c33" stroke="#ffd400" strokeWidth="1">
        {size === 'dettaglio' ? (
          <circle cx={cx} cy="45" r="30" />
        ) : (
          <>
            <circle cx={cx} cy={headY} r={headR} />
            <path d={`M ${cx - h * 0.16} ${headY + headR * 1.4} Q ${cx} ${headY + headR * 1.1} ${cx + h * 0.16} ${headY + headR * 1.4} L ${cx + h * 0.13} ${headY + h * 0.92} L ${cx - h * 0.13} ${headY + h * 0.92} Z`} />
          </>
        )}
      </g>
      <g stroke="#f2f2ee" strokeWidth="2" fill="none" strokeLinecap="round">
        {/panoram|pan/.test(m) && <><path d="M 12 12 H 40" /><path d="M 34 7 L 40 12 L 34 17" /></>}
        {/carrell|dolly|avanz/.test(m) && <><path d="M 20 45 L 34 45" /><path d="M 30 40 L 35 45 L 30 50" /><path d="M 140 45 L 126 45" /><path d="M 130 40 L 125 45 L 130 50" /></>}
        {/zoom/.test(m) && <><path d="M 8 8 L 18 18" /><path d="M 152 8 L 142 18" /><path d="M 8 82 L 18 72" /><path d="M 152 82 L 142 72" /></>}
        {/mano|handheld/.test(m) && <path d="M 10 14 q 4 -6 8 0 t 8 0 t 8 0" />}
        {/orbit|circol/.test(m) && <><path d="M 60 82 A 26 6 0 1 0 100 82" /><path d="M 96 78 L 100 82 L 95 85" /></>}
        {/tilt|inclina|verticale/.test(m) && <><path d="M 150 10 V 34" /><path d="M 145 28 L 150 34 L 155 28" /></>}
      </g>
    </svg>
  )
}

/* ---------------- scheda di un'inquadratura ---------------- */

export function ShotCard({ shot, code, video, onChange, onDelete, onMove, compact }: {
  shot: Shot
  code: string
  video: VideoProject
  onChange: (p: Partial<Shot>) => void
  onDelete: () => void
  onMove?: (dir: -1 | 1) => void
  compact?: boolean
}) {
  const { toast } = useApp()
  const [open, setOpen] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const names = video.sheets.map((s) => s.name)

  async function upload(f: File) {
    try { const { imageId } = await storeImage(video.id, f); onChange({ frameImageId: imageId }) }
    catch (e) { toast((e as Error).message, 'err') }
  }

  return (
    <div className={`shot ${shot.done ? 'is-done' : ''}`}>
      <div className="shot-frame" onClick={() => file.current?.click()} title="Tocca per caricare uno schizzo o un'immagine">
        {shot.frameImageId ? <StoredImage imageId={shot.frameImageId} alt={`Inquadratura ${code}`} className="shot-img" /> : <FramingGlyph size={shot.size} movement={shot.movement} angle={shot.angle} />}
        <span className="shot-code">{code}</span>
        {shot.technique === '3d' && <span className="shot-tech">3D</span>}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
      </div>
      <div className="shot-body">
        <div className="row" style={{ gap: 6 }}>
          <b className="shot-size">{shot.size}</b>
          <span className="mono dim" style={{ fontSize: 12 }}>{fmtDur(shot.durationSec)}{shot.durationSec % 1 ? ` (${shot.durationSec}s)` : ''}</span>
        </div>
        {!compact && <div className="dim" style={{ fontSize: 12 }}>{[shot.angle, shot.movement, shot.lens].filter(Boolean).join(' · ')}</div>}
        <p className="shot-desc">{shot.description || <span className="dim">Nessuna descrizione</span>}</p>
        {!compact && shot.transition && <div className="label">→ {shot.transition}</div>}
        <div className="row" style={{ marginTop: 6, gap: 4 }}>
          <button className="btn ghost sm" type="button" onClick={() => setOpen((o) => !o)}>{open ? 'Chiudi' : 'Modifica'}</button>
          {onMove && <><button className="btn ghost sm" type="button" aria-label="Prima" onClick={() => onMove(-1)}>←</button><button className="btn ghost sm" type="button" aria-label="Dopo" onClick={() => onMove(1)}>→</button></>}
          {shot.frameImageId && <button className="btn ghost sm" type="button" onClick={() => onChange({ frameImageId: undefined })}>Togli immagine</button>}
          <button className="btn ghost sm" type="button" aria-label="Elimina inquadratura" onClick={() => { if (confirm(`Eliminare l'inquadratura ${code}?`)) onDelete() }}>×</button>
        </div>
      </div>
      {open && (
        <div className="shot-edit">
          <div className="row" style={{ alignItems: 'stretch' }}>
            <select className="select" style={{ flex: '1 1 150px', width: 'auto' }} value={shot.size} aria-label="Piano" onChange={(e) => onChange({ size: e.target.value as ShotSize })}>
              {SHOT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="select" style={{ flex: '0 1 120px', width: 'auto' }} value={shot.technique} aria-label="Tecnica" onChange={(e) => onChange({ technique: e.target.value as VideoTechnique })}>
              <option value="reale">Reale</option><option value="3d">3D</option>
            </select>
            <InlineInput style={{ flex: '0 1 90px' }} type="number" min={0} value={String(shot.durationSec || '')} placeholder="Sec" onSave={(v) => onChange({ durationSec: Math.max(0, Number(v) || 0) })} />
          </div>
          <div className="grid cols-3" style={{ marginTop: 10, gap: 10 }}>
            <TextField label="Angolazione" value={shot.angle} onSave={(angle) => onChange({ angle })} />
            <TextField label="Movimento" value={shot.movement} onSave={(movement) => onChange({ movement })} />
            <TextField label="Ottica / camera" value={shot.lens} onSave={(lens) => onChange({ lens })} />
          </div>
          <TextField label="Cosa si vede" multiline rows={3} value={shot.description} onSave={(description) => onChange({ description })} />
          <div className="grid cols-3" style={{ gap: 10 }}>
            <TextField label="Luce" value={shot.light} onSave={(light) => onChange({ light })} />
            <TextField label="Transizione in uscita" value={shot.transition} onSave={(transition) => onChange({ transition })} />
            <TextField label="Musica / suono" value={shot.sound} onSave={(sound) => onChange({ sound })} />
          </div>
          <div className="label" style={{ marginBottom: 6 }}>Schede in campo</div>
          <div className="filters" style={{ margin: 0 }}>
            {names.map((n) => {
              const on = shot.sheets.includes(n)
              return <button key={n} type="button" className={`tag ${on ? 'solid' : ''}`} aria-pressed={on} onClick={() => onChange({ sheets: on ? shot.sheets.filter((x) => x !== n) : [...shot.sheets, n] })}>{n}</button>
            })}
            {shot.sheets.filter((n) => !names.includes(n)).map((n) => (
              <button key={n} type="button" className="tag bad" title="Nessuna scheda con questo nome: tocca per toglierlo" onClick={() => onChange({ sheets: shot.sheets.filter((x) => x !== n) })}>{n} ×</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Controllo durata: inquadrature di una scena vs durata della scena. */
export function DurationCheck({ scene, shots }: { scene: Scene; shots: Shot[] }) {
  const tot = Math.round(shots.reduce((n, s) => n + s.durationSec, 0) * 10) / 10
  if (!shots.length || !scene.durationSec) return null
  const d = Math.round((tot - scene.durationSec) * 10) / 10
  const ok = Math.abs(d) <= 1
  return <span className="label" style={{ color: ok ? 'var(--green)' : 'var(--red)' }}>{ok ? `${tot}s ✓` : `${tot}s su ${scene.durationSec}s (${d > 0 ? '+' : ''}${d}s)`}</span>
}
