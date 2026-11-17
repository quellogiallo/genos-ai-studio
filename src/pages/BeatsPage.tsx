import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type AiNote } from '../lib/db'
import { buildProjectContext } from '../lib/context'
import { analysisToText } from '../lib/music/diagnosis'
import { BEAT_SYSTEM, beatsToMarkdown, LANE_LABEL, LANES, parseBeats, playGroove, type BeatConcept, type BeatResult } from '../lib/music/beats'
import { useApp } from '../components/AppState'
import AiRunner from '../components/AiRunner'
import AiNotesList from '../components/AiNotesList'

export default function BeatsPage() {
  const { activeProject } = useApp()
  const [brief, setBrief] = useState('')
  const [bpm, setBpm] = useState('')
  const [picked, setPicked] = useState<string[]>([])

  const refs = useLiveQuery(async () => {
    if (!activeProject) return []
    const ts = (await db.tracks.where('projectId').equals(activeProject.id).toArray()).filter((t) => t.kind === 'reference')
    return Promise.all(ts.map(async (t) => ({ t, v: (await db.versions.where('trackId').equals(t.id).toArray()).find((v) => v.analysis) })))
  }, [activeProject?.id])

  if (!activeProject) return <div className="page"><h1 className="display">Concept beat</h1><div className="notice section">Serve un progetto attivo. <Link to="/projects" className="y">Scegline uno →</Link></div></div>

  const build = () => {
    const chosen = (refs ?? []).filter((r) => picked.includes(r.t.id))
    const user = [
      `CONTESTO DEL PROGETTO\n${buildProjectContext(activeProject)}`,
      `RICHIESTA: ${brief.trim() || 'tre concept di beat coerenti con il progetto'}`,
      bpm.trim() ? `BPM desiderato: ${bpm.trim()} (puoi discostarti solo se lo motivi)` : 'BPM: libero.',
      chosen.length ? `REFERENCE SELEZIONATE:\n${chosen.map((r) => `--- ${r.t.artist ? `${r.t.artist} — ` : ''}${r.t.title} (focus: ${r.t.refFocus?.join(', ') || 'n.d.'})${r.t.notes ? ` · ${r.t.notes}` : ''}\n${r.v?.analysis ? analysisToText(r.v.analysis) : 'non analizzata'}`).join('\n\n')}` : 'REFERENCE: nessuna selezionata.',
      'Rispondi solo con il JSON richiesto.',
    ].join('\n\n')
    return { task: 'creative' as const, maxTokens: 8192, json: true, system: BEAT_SYSTEM, user }
  }

  const onResult = async (text: string) => {
    const r = parseBeats(text)
    await db.aiNotes.add({ id: uid(), scope: 'project', refId: activeProject.id, kind: 'beat', userNote: [brief.trim(), bpm.trim() && `${bpm.trim()} BPM`].filter(Boolean).join(' · '), markdown: beatsToMarkdown(r), data: r, createdAt: Date.now() })
  }

  return (
    <div className="page">
      <div className="label"><Link to="/music">01 / Music Lab</Link> / Concept beat</div>
      <h1 className="display">Concept<br /><span className="y">beat</span></h1>
      <p className="dim">Tre idee di beat diverse tra loro, con groove ascoltabile, palette di suoni in Ableton, arrangiamento e prompt per generatori musicali AI.</p>

      <div className="card section">
        <textarea className="textarea" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Che beat cerchi? Es. «ritmo spezzato e freddo per la strofa, che esploda nel ritornello», «qualcosa di ipnotico per un intro lungo»" />
        <div className="row" style={{ marginTop: 10, alignItems: 'stretch' }}>
          <input className="input" style={{ width: 140 }} inputMode="numeric" placeholder="BPM (opz.)" value={bpm} onChange={(e) => setBpm(e.target.value.replace(/[^\d.]/g, ''))} />
        </div>
        {refs && refs.length > 0 && <>
          <div className="label" style={{ margin: '12px 0 6px' }}>Usa queste reference (i loro dati misurati entrano nel prompt)</div>
          <div className="pills">{refs.map((r) => <button key={r.t.id} type="button" className={`chip ${picked.includes(r.t.id) ? 'on' : ''}`} onClick={() => setPicked((x) => (x.includes(r.t.id) ? x.filter((y) => y !== r.t.id) : [...x, r.t.id]))}>{r.t.artist ? `${r.t.artist} — ` : ''}{r.t.title}</button>)}</div>
        </>}
        <div style={{ marginTop: 14 }}><AiRunner label="Genera 3 concept" build={build} onResult={onResult} /></div>
      </div>

      <AiNotesList refId={activeProject.id} kinds={['beat']} render={(n: AiNote) => (n.data ? <BeatView r={n.data as BeatResult} /> : null)} />
    </div>
  )
}

function BeatView({ r }: { r: BeatResult }) {
  return (
    <div>
      {r.concepts.map((c, i) => <ConceptCard key={i} c={c} n={i + 1} />)}
      {r.domande.length > 0 && <div className="notice" style={{ marginTop: 12 }}><b>Domande</b><ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>{r.domande.map((d) => <li key={d}>{d}</li>)}</ul></div>}
    </div>
  )
}

function ConceptCard({ c, n }: { c: BeatConcept; n: number }) {
  const { toast } = useApp()
  const [playing, setPlaying] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const timer = useRef(0)
  useEffect(() => () => { stopRef.current?.(); clearTimeout(timer.current) }, [])

  function toggle() {
    if (playing) { stopRef.current?.(); clearTimeout(timer.current); setPlaying(false); return }
    const p = playGroove(c.groove, c.bpm, c.swing, 4)
    stopRef.current = p.stop; setPlaying(true)
    timer.current = window.setTimeout(() => setPlaying(false), p.duration * 1000 + 300)
  }

  const lanes = LANES.filter((l) => c.groove[l])
  return (
    <div className="beat">
      <div className="row"><span className="sec-letter">{n}</span><h3 className="display" style={{ fontSize: '1.15rem', flex: 1 }}>{c.titolo}</h3><span className="tag">{c.bpm} BPM{c.swing ? ` · swing ${c.swing}%` : ''}</span></div>
      <p>{c.idea}</p>
      <p className="md-field"><b className="y">Perché funziona:</b> {c.perche_funziona}</p>
      <p className="md-field"><b className="y">Limiti:</b> {c.limiti}</p>

      <div className="grid16">
        {lanes.map((l) => (
          <div key={l} className="grid16-row">
            <span className="label">{LANE_LABEL[l]}</span>
            <div className="steps16">{c.groove[l]!.split('').map((ch, i) => <span key={i} className={`st ${ch === 'x' ? 'on' : ch === 'o' ? 'ghost' : ''} ${i % 4 === 0 ? 'beat-start' : ''}`} />)}</div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={toggle}>{playing ? '■ Stop' : '▶ Ascolta il groove'}</button>
        <span className="label">anteprima con suoni sintetici del browser, 4 battute</span>
      </div>

      {c.palette.length > 0 && <><div className="label" style={{ marginTop: 14 }}>Palette in Ableton</div>
        {c.palette.map((p, i) => <div key={i} className="list-item"><span className="tag y">{p.ruolo}</span><div className="grow"><b>{p.suono}</b><div className="dim" style={{ fontSize: 13 }}>{p.ableton}</div></div></div>)}</>}

      {c.arrangiamento.length > 0 && <><div className="label" style={{ marginTop: 14 }}>Arrangiamento</div>
        <div className="arr">{c.arrangiamento.map((a, i) => <div key={i} className="arr-block" style={{ flexGrow: Math.max(1, a.battute) }} title={a.cosa_succede}><b>{a.sezione}</b><span className="mono">{a.battute} batt.</span><span className="dim">{a.cosa_succede}</span></div>)}</div></>}

      {c.prompt_ai && <div className="card" style={{ marginTop: 14 }}>
        <div className="row"><span className="label">Prompt per generatori musicali AI</span><div className="spacer" /><button className="btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(c.prompt_ai); toast('Prompt copiato') } catch { toast('Copia non riuscita', 'err') } }}>Copia</button></div>
        <div className="mono" style={{ fontSize: 13, marginTop: 6 }}>{c.prompt_ai}</div>
      </div>}
      {c.variante_sperimentale && <p className="md-field" style={{ marginTop: 12 }}><b className="y">Variante sperimentale:</b> {c.variante_sperimentale}</p>}
    </div>
  )
}
