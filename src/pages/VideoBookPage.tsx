import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { shotCodes } from '../lib/video/prompts'
import { FORMAT_LABEL, TECHNIQUE_LABEL, fmtDur } from '../lib/video/types'
import { StoredImage } from '../components/video/common'
import { FramingGlyph } from '../components/video/shots'

/** Libro di produzione: pagina pulita su fondo bianco, pensata per Stampa → Salva come PDF. */
export default function VideoBookPage() {
  const { videoId } = useParams()
  const v = useLiveQuery(async () => (videoId ? (await db.videos.get(videoId)) ?? null : null), [videoId])
  const project = useLiveQuery(async () => (v ? (await db.projects.get(v.projectId)) ?? null : undefined), [v?.projectId])
  if (v === undefined || project === undefined) return <div className="book"><p>Caricamento…</p></div>
  if (!v) return <div className="book"><p>Video non trovato.</p></div>

  const codes = shotCodes(v)
  const byId = new Map(codes.map((c) => [c.shot.id, c]))
  const total = (v.shots ?? []).reduce((n, s) => n + s.durationSec, 0)

  return (
    <div className="book">
      <div className="book-bar no-print">
        <Link to={`/video/${v.id}?s=export`}>← Torna al video</Link>
        <button type="button" onClick={() => window.print()}>Stampa / Salva PDF</button>
      </div>

      <header className="book-cover">
        <div className="book-kicker">GENOS AI STUDIO · Libro di produzione</div>
        <h1>{v.title}</h1>
        <p>{FORMAT_LABEL[v.format]} · {v.techniques.map((t) => TECHNIQUE_LABEL[t]).join(' + ')}{project ? ` · progetto ${project.name}` : ''}{total ? ` · ${fmtDur(total)}` : ''}</p>
        <p className="book-date">{new Date().toLocaleDateString('it-IT', { dateStyle: 'long' })}</p>
      </header>

      {v.concept && <section><h2>Concept</h2>
        <p className="book-lead">{v.concept.logline}</p>
        <dl><dt>Tema</dt><dd>{v.concept.theme}</dd><dt>Sottotesto</dt><dd>{v.concept.subtext}</dd><dt>Tono</dt><dd>{v.concept.tone}</dd><dt>Promessa visiva</dt><dd>{v.concept.visualPromise}</dd></dl>
      </section>}

      {v.direction && <section><h2>Direzione artistica — {v.direction.name}</h2>
        <p className="book-lead">{v.direction.logline}</p>
        <div className="book-palette">{v.direction.palette.map((c) => <div key={c.hex}><span style={{ background: c.hex }} /><b>{c.name}</b> {c.hex}<br /><small>{c.role}</small></div>)}</div>
        <dl><dt>Look</dt><dd>{v.direction.look}</dd><dt>Luce</dt><dd>{v.direction.light}</dd><dt>Texture</dt><dd>{v.direction.texture}</dd><dt>Camera</dt><dd>{v.direction.camera}</dd></dl>
        {v.direction.rules.length > 0 && <><h3>Regole</h3><ul>{v.direction.rules.map((r) => <li key={r}>{r}</li>)}</ul></>}
        {v.direction.avoid.length > 0 && <><h3>Da evitare</h3><ul>{v.direction.avoid.map((r) => <li key={r}>{r}</li>)}</ul></>}
      </section>}

      {v.sheets.length > 0 && <section><h2>Schede</h2>
        <div className="book-sheets">{v.sheets.map((s) => <div key={s.id} className="book-sheet">
          {s.imageId && <StoredImage imageId={s.imageId} alt={s.name} className="book-img" />}
          <h3>{s.name} <small>({s.kind})</small></h3><p><i>{s.role}</i></p>
          <p><b>Aspetto:</b> {s.look}</p>{s.details && <p><b>Dettagli:</b> {s.details}</p>}{s.colors && <p><b>Colori:</b> {s.colors}</p>}{s.continuity && <p><b>Continuità:</b> {s.continuity}</p>}
        </div>)}</div>
      </section>}

      {v.scenes.length > 0 && <section className="book-break"><h2>Sceneggiatura</h2>
        {v.arc && <p className="book-lead">{v.arc}</p>}
        {v.scenes.map((s, i) => <div key={s.id} className="book-scene">
          <h3>{i + 1}. {s.setting}{s.time ? ` — ${s.time}` : ''} <small>[{fmtDur(s.durationSec)}]</small></h3>
          {s.title && <p><b>{s.title}</b></p>}
          <p>{s.action}</p>
          <p className="book-meta">{[s.music && `Musica: ${s.music}`, s.sheets.length && `Con: ${s.sheets.join(', ')}`, s.intent && `Intento: ${s.intent}`].filter(Boolean).join(' · ')}</p>
        </div>)}
      </section>}

      {codes.length > 0 && <section className="book-break"><h2>Storyboard</h2>
        <div className="book-board">{codes.map(({ code, shot }) => <div key={shot.id} className="book-frame">
          <div className="book-frame-img">{shot.frameImageId ? <StoredImage imageId={shot.frameImageId} alt={code} className="book-img" /> : <FramingGlyph size={shot.size} movement={shot.movement} angle={shot.angle} />}</div>
          <p><b>{code}</b> · {shot.size} · {shot.durationSec}s{shot.technique === '3d' ? ' · 3D' : ''}</p>
          <p className="book-meta">{[shot.angle, shot.movement, shot.lens].filter(Boolean).join(' · ')}</p>
          <p>{shot.description}</p>
        </div>)}</div>
      </section>}

      {codes.length > 0 && <section className="book-break"><h2>Shot list</h2>
        <table><thead><tr><th>#</th><th>Luogo</th><th>Piano</th><th>Camera</th><th>Cosa si vede</th><th>Sec</th></tr></thead>
          <tbody>{codes.map(({ code, shot, scene }) => <tr key={shot.id}><td>{code}</td><td>{scene.setting}</td><td>{shot.size}</td><td>{[shot.angle, shot.movement, shot.lens].filter(Boolean).join(', ')}</td><td>{shot.description}</td><td>{shot.durationSec}</td></tr>)}</tbody>
        </table>
        {codes.some((c) => c.shot.prompt || c.shot.note3d) && <><h3>Prompt e note 3D</h3>{codes.filter((c) => c.shot.prompt || c.shot.note3d).map(({ code, shot }) => <div key={shot.id} className="book-prompt"><b>{code}</b> <code>{shot.prompt}</code>{shot.note3d && <p><b>3D:</b> {shot.note3d}</p>}</div>)}</>}
      </section>}

      {v.shootPlan && <section className="book-break"><h2>Piano di riprese</h2>
        {v.shootPlan.days.map((d, i) => <div key={d.id} className="book-scene">
          <h3>{i + 1}. {d.title} <small>{[d.location, d.time].filter(Boolean).join(' · ')}</small></h3>
          <p>{d.shotIds.map((id) => byId.get(id)?.code).filter(Boolean).join(', ')}</p>
          {d.prep && <p><b>Preparazione:</b> {d.prep}</p>}{d.gear.length > 0 && <p><b>Attrezzatura:</b> {d.gear.join(', ')}</p>}{d.notes && <p><b>Note:</b> {d.notes}</p>}
        </div>)}
        {v.shootPlan.gear.length > 0 && <p><b>Attrezzatura generale:</b> {v.shootPlan.gear.join(', ')}</p>}
        {v.shootPlan.props.length > 0 && <p><b>Oggetti di scena:</b> {v.shootPlan.props.join(', ')}</p>}
        {v.shootPlan.risks.length > 0 && <><h3>Rischi</h3><ul>{v.shootPlan.risks.map((r) => <li key={r}>{r}</li>)}</ul></>}
      </section>}

      {v.editPlan && <section><h2>Montaggio</h2>
        <p className="book-lead">{v.editPlan.approach}</p>
        {v.editPlan.sections.map((s, i) => <p key={i}><b>{s.section}:</b> {s.rhythm} — {s.cuts}</p>)}
        {v.editPlan.keyMoments.length > 0 && <><h3>Momenti chiave</h3><ul>{v.editPlan.keyMoments.map((k, i) => <li key={i}><b>{k.time}</b> {k.what}</li>)}</ul></>}
        {v.editPlan.transitions.length > 0 && <p><b>Transizioni:</b> {v.editPlan.transitions.join('; ')}</p>}
        {v.editPlan.avoid.length > 0 && <p><b>Da evitare:</b> {v.editPlan.avoid.join('; ')}</p>}
      </section>}

      {v.colorPlan && <section><h2>Color grading{v.colorPlan.software ? ` — ${v.colorPlan.software}` : ''}</h2>
        <p className="book-lead">{v.colorPlan.overall}</p>
        {v.colorPlan.params.length > 0 && <table><tbody>{v.colorPlan.params.map((p, i) => <tr key={i}><td><b>{p.name}</b></td><td>{p.value}</td><td>{p.why}</td></tr>)}</tbody></table>}
        {v.colorPlan.perScene.map((p, i) => <p key={i}><b>Scena {p.scene}:</b> {p.look}{p.note ? ` — ${p.note}` : ''}</p>)}
        {v.colorPlan.steps.length > 0 && <><h3>Passaggi</h3><ol>{v.colorPlan.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></>}
        {v.colorPlan.render3d && <p><b>Render 3D:</b> {v.colorPlan.render3d}</p>}
      </section>}
    </div>
  )
}
