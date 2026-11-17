import { Link } from 'react-router-dom'
import { useApp } from '../AppState'
import { shotCodes } from '../../lib/video/prompts'
import { fmtDur } from '../../lib/video/types'
import { StepHead, type StepProps } from './common'

export default function ExportStep({ video }: StepProps) {
  const { toast } = useApp()
  const shots = video.shots ?? []
  const items = [
    ['Concept', !!video.concept], ['Direzione artistica', !!video.direction], ['Moodboard', video.mood.length > 0], ['Schede', video.sheets.length > 0],
    ['Sceneggiatura', video.scenes.length > 0], ['Storyboard', shots.length > 0], ['Prompt', shots.some((s) => s.prompt)],
    ['Piano di riprese', !!video.shootPlan], ['Montaggio', !!video.editPlan], ['Color', !!video.colorPlan],
  ] as const

  async function copyAll() {
    const L: string[] = [`${video.title.toUpperCase()}`]
    if (video.concept) L.push(`\nLOGLINE: ${video.concept.logline}`)
    if (video.direction) L.push(`DIREZIONE: ${video.direction.name} — ${video.direction.logline}`)
    video.scenes.forEach((sc, i) => L.push(`\nSCENA ${i + 1} · ${sc.title} · ${sc.setting} · ${fmtDur(sc.durationSec)}\n${sc.action}`))
    if (shots.length) {
      L.push('\nINQUADRATURE')
      shotCodes(video).forEach(({ code, shot }) => L.push(`${code} ${shot.size}${shot.movement ? `, ${shot.movement}` : ''} · ${shot.durationSec}s — ${shot.description}`))
    }
    try { await navigator.clipboard.writeText(L.join('\n')); toast('Testo copiato') } catch { toast('Il browser ha bloccato la copia', 'err') }
  }

  return (
    <section className="section">
      <StepHead num="12" title="Export" hint="Il libro di produzione da stampare o salvare in PDF, e la checklist da usare sul set dal telefono." />
      <div className="pills" style={{ marginBottom: 16 }}>
        {items.map(([l, ok]) => <span key={l} className={`tag ${ok ? 'solid' : ''}`}>{ok ? '✓ ' : ''}{l}</span>)}
      </div>
      <div className="grid cols-2">
        <Link to={`/video/${video.id}/book`} className="card hover">
          <div className="label">PDF stampabile</div>
          <h2 className="display" style={{ marginTop: 8, fontSize: '1.4rem' }}>Libro di produzione</h2>
          <p className="dim" style={{ fontSize: 13 }}>Tutto il progetto su fondo bianco: concept, direzione, palette, schede, sceneggiatura, storyboard, shot list, riprese, montaggio, color. Poi “Stampa” → “Salva come PDF”.</p>
        </Link>
        <Link to={`/video/${video.id}/checklist`} className="card hover">
          <div className="label">Sul set</div>
          <h2 className="display" style={{ marginTop: 8, fontSize: '1.4rem' }}>Checklist da telefono</h2>
          <p className="dim" style={{ fontSize: 13 }}>Blocchi di ripresa con le inquadrature da spuntare man mano, attrezzatura e oggetti di scena. Le spunte restano salvate.</p>
        </Link>
      </div>
      <div className="row section"><button className="btn ghost sm" type="button" onClick={copyAll}>Copia tutto come testo</button></div>
    </section>
  )
}
