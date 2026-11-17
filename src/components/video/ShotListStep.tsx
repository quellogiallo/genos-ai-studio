import { useState } from 'react'
import { useApp } from '../AppState'
import { fmtDur, SHOT_SIZES, type Shot, type ShotSize } from '../../lib/video/types'
import { StepHead, type StepProps } from './common'
import { codeMap } from './shots'

/** Shot list: la stessa lista dello storyboard, in forma tecnica da tabella. */
export default function ShotListStep({ video, update }: StepProps) {
  const { toast } = useApp()
  const [tech, setTech] = useState<'all' | 'reale' | '3d'>('all')
  const [loc, setLoc] = useState('all')
  const shots = video.shots ?? []
  const codes = codeMap(video)
  const sceneOf = new Map(video.scenes.map((s, i) => [s.id, { s, i }]))
  const locations = [...new Set(video.scenes.map((s) => s.setting).filter(Boolean))]

  const rows = video.scenes.flatMap((sc) => shots.filter((t) => t.sceneId === sc.id))
    .filter((t) => tech === 'all' || t.technique === tech)
    .filter((t) => loc === 'all' || sceneOf.get(t.sceneId)?.s.setting === loc)

  const patch = (id: string, p: Partial<Shot>) => update({ shots: shots.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  const total = rows.reduce((n, t) => n + t.durationSec, 0)

  async function copyCsv() {
    const head = ['Codice', 'Scena', 'Luogo', 'Momento', 'Tecnica', 'Piano', 'Angolazione', 'Movimento', 'Ottica', 'Luce', 'Durata (s)', 'Cosa si vede', 'Schede', 'Transizione']
    const esc = (x: string | number) => `"${String(x).replace(/"/g, '""')}"`
    const lines = [head.map(esc).join(','), ...rows.map((t) => {
      const sc = sceneOf.get(t.sceneId)!
      return [codes.get(t.id) ?? '', sc.s.title, sc.s.setting, sc.s.time, t.technique === '3d' ? '3D' : 'Reale', t.size, t.angle, t.movement, t.lens, t.light, t.durationSec, t.description, t.sheets.join('; '), t.transition].map(esc).join(',')
    })]
    try { await navigator.clipboard.writeText(lines.join('\n')); toast('Shot list copiata: incollala in un foglio di calcolo') } catch { toast('Il browser ha bloccato la copia', 'err') }
  }

  if (!shots.length) {
    return (
      <section className="section">
        <StepHead num="07" title="Shot list" hint="L'elenco tecnico delle inquadrature." />
        <div className="notice">Le inquadrature nascono nello storyboard (passo 06).</div>
      </section>
    )
  }

  return (
    <section className="section">
      <StepHead num="07" title="Shot list" hint="Le stesse inquadrature dello storyboard in forma tecnica: modifichi qui o là, è un'unica lista. Filtra per luogo o tecnica per preparare le riprese." />
      <div className="row" style={{ alignItems: 'stretch', marginBottom: 12 }}>
        <select className="select" style={{ width: 'auto', flex: '1 1 160px' }} value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Luogo">
          <option value="all">Tutti i luoghi</option>
          {locations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select className="select" style={{ width: 'auto' }} value={tech} onChange={(e) => setTech(e.target.value as typeof tech)} aria-label="Tecnica">
          <option value="all">Reale + 3D</option><option value="reale">Solo reale</option><option value="3d">Solo 3D</option>
        </select>
        <button className="btn ghost sm" type="button" onClick={copyCsv}>Copia per foglio di calcolo</button>
      </div>
      <div className="label" style={{ marginBottom: 8 }}>{rows.length} inquadrature · {fmtDur(total)}</div>
      <div className="sl-table">
        <div className="sl-row sl-headrow"><span>#</span><span>Piano</span><span>Camera</span><span>Cosa si vede</span><span>Sec</span></div>
        {rows.map((t) => {
          const sc = sceneOf.get(t.sceneId)!
          return (
            <div key={t.id} className="sl-row">
              <span className="mono"><b>{codes.get(t.id)}</b>{t.technique === '3d' && <span className="tag y" style={{ marginLeft: 4, padding: '0 4px' }}>3D</span>}</span>
              <span>
                <select className="sl-select" value={t.size} aria-label="Piano" onChange={(e) => patch(t.id, { size: e.target.value as ShotSize })}>
                  {SHOT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </span>
              <span className="dim">{[t.angle, t.movement, t.lens].filter(Boolean).join(' · ') || '—'}</span>
              <span><span className="label">{sc.s.setting}{sc.s.time ? ` · ${sc.s.time}` : ''}</span><br />{t.description}{t.sheets.length > 0 && <span className="dim"> — {t.sheets.join(', ')}</span>}</span>
              <span className="mono">{t.durationSec}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
