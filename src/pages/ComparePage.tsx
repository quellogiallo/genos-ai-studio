import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type Project, type Track, type TrackVersion } from '../lib/db'
import { checksDiff, estimateOffset, metricRows, spectrumDiff, buildComparePrompt, type MetricRow } from '../lib/music/compare'
import { LoudnessOverlay, SpectrumChart, SpectrumDiffChart } from '../components/charts'
import { fmtTime } from '../components/AnalysisReport'
import AiRunner from '../components/AiRunner'
import { DiagnosisCard } from '../components/DiagnosisPanel'

export default function ComparePage() {
  const { trackId } = useParams()
  const [params, setParams] = useSearchParams()
  const track = useLiveQuery(() => (trackId ? db.tracks.get(trackId) : undefined), [trackId])
  const versions = useLiveQuery(() => (trackId ? db.versions.where('trackId').equals(trackId).sortBy('createdAt') : []), [trackId])
  // reference del progetto (brani di altri artisti) confrontabili come B
  const refs = useLiveQuery(async () => {
    if (!track) return []
    const ts = (await db.tracks.where('projectId').equals(track.projectId).toArray()).filter((t) => t.kind === 'reference')
    const out: { v: TrackVersion; t: Track }[] = []
    for (const t of ts) (await db.versions.where('trackId').equals(t.id).toArray()).filter((v) => v.analysis).forEach((v) => out.push({ v, t }))
    return out
  }, [track?.projectId])

  if (track === undefined || versions === undefined) return <div className="page"><div className="row dim"><div className="spinner" /> Caricamento…</div></div>
  if (!track) return <div className="page"><div className="notice err">Brano non trovato.</div></div>

  const analyzed = versions.filter((v) => v.analysis)
  const refList = refs ?? []
  const aId = params.get('a') ?? (analyzed.length >= 2 ? analyzed[analyzed.length - 2]?.id : analyzed[0]?.id)
  const bId = params.get('b') ?? (analyzed.length >= 2 ? analyzed[analyzed.length - 1]?.id : refList[0]?.v.id)
  const A = analyzed.find((v) => v.id === aId)
  const refB = refList.find((r) => r.v.id === bId)
  const B = analyzed.find((v) => v.id === bId) ?? refB?.v
  const pick = (k: 'a' | 'b', id: string) => setParams({ a: k === 'a' ? id : aId ?? '', b: k === 'b' ? id : bId ?? '' })

  return (
    <div className="page">
      <div className="label"><Link to="/music">01 / Music Lab</Link> / <Link to={`/music/${track.id}`}>{track.title}</Link> / Confronto</div>
      <h1 className="display">Confronto</h1>

      {analyzed.length < 1 || analyzed.length + refList.length < 2 ? (
        <div className="notice section">Servono due versioni analizzate di questo brano, oppure una versione e una reference. <Link to={`/music/${track.id}`} className="y">Carica una versione →</Link> · <Link to="/music/references" className="y">Aggiungi una reference →</Link></div>
      ) : (
        <>
          <div className="ab-pick section">
            {(['a', 'b'] as const).map((k) => (
              <label key={k} className={`ab-slot ${k}`}>
                <span className="ab-letter">{k.toUpperCase()}</span>
                <select className="select" value={k === 'a' ? aId : bId} onChange={(e) => pick(k, e.target.value)}>
                  <optgroup label="Versioni di questo brano">
                    {analyzed.map((v) => <option key={v.id} value={v.id}>{v.label} · {new Date(v.createdAt).toLocaleDateString('it-IT')}</option>)}
                  </optgroup>
                  {k === 'b' && refList.length > 0 && (
                    <optgroup label="Reference">
                      {refList.map(({ v, t }) => <option key={v.id} value={v.id}>{t.artist ? `${t.artist} — ` : ''}{t.title}</option>)}
                    </optgroup>
                  )}
                </select>
              </label>
            ))}
          </div>
          {A && B && (A.id === B.id
            ? <div className="notice section">Scegli due versioni diverse.</div>
            : <CompareView key={`${A.id}-${B.id}`} A={A} B={B} track={track} reference={refB?.t} />)}
        </>
      )}
    </div>
  )
}

function CompareView({ A, B, track, reference }: { A: TrackVersion; B: TrackVersion; track: Track; reference?: Track }) {
  const projectId = track.projectId
  const a = A.analysis!, b = B.analysis!
  const [auto, setAuto] = useState<{ offset: number; confidence: number } | null>(null)
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    if (reference) { setAuto({ offset: 0, confidence: 0 }); return }
    let alive = true
    Promise.all([db.audioFiles.get(A.id), db.audioFiles.get(B.id)])
      .then(([fa, fb]) => (fa && fb ? estimateOffset(fa.blob, fb.blob) : { offset: 0, confidence: 0 }))
      .then((r) => { if (!alive) return; setAuto(r); if (r.confidence > 0.4) setOffset(r.offset) })
      .catch(() => alive && setAuto({ offset: 0, confidence: 0 }))
    return () => { alive = false }
  }, [A.id, B.id])
  const [time, setTime] = useState(0)
  const seekRef = useRef<(t: number) => void>(() => {})
  const rows = useMemo(() => metricRows(a, b), [a, b])
  const diff = useMemo(() => spectrumDiff(a, b), [a, b])
  const checks = useMemo(() => checksDiff(a, b), [a, b])
  const [project, setProject] = useState<Project>()
  const [note, setNote] = useState('')
  useEffect(() => { db.projects.get(projectId).then(setProject) }, [projectId])
  // il confronto si salva sulla versione B; con una reference si salva sulla tua versione A
  const target = reference ? A.id : B.id
  const history = useLiveQuery(async () => (await db.diagnoses.where('versionId').equals(target).reverse().sortBy('createdAt')).filter((d) => d.kind === 'confronto'), [target])

  const groups = [...new Set(rows.map((r) => r.group))]

  return (
    <>
      <ABPlayer A={A} B={reference ? { ...B, label: reference.title } : B} offset={offset} lufsA={a.integratedLufs} lufsB={b.integratedLufs} onTime={setTime} seekRef={seekRef} />

      {reference && <div className="notice" style={{ marginTop: 10, fontSize: 13 }}>B è una <b>reference</b>{reference.refFocus?.length ? ` (focus: ${reference.refFocus.join(', ')})` : ''}. Confronta soprattutto bilanciamento tonale e stereo: se A non è ancora masterizzato, volume e dinamica saranno diversi per natura.</div>}
      {!reference && <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <span className="label">Allineamento B: {offset >= 0 ? '+' : ''}{offset.toFixed(2)} s</span>
        <button className="btn ghost sm" onClick={() => setOffset((o) => Math.round((o - 0.01) * 100) / 100)}>−10 ms</button>
        <button className="btn ghost sm" onClick={() => setOffset((o) => Math.round((o + 0.01) * 100) / 100)}>+10 ms</button>
        {auto ? <>
          <button className="btn ghost sm" onClick={() => setOffset(auto.offset)}>Auto ({auto.offset >= 0 ? '+' : ''}{auto.offset.toFixed(2)} s)</button>
          <span className="label">{auto.confidence > 0.4 ? 'allineamento automatico affidabile' : 'allineamento automatico incerto: controlla a orecchio'}</span>
        </> : <span className="label row" style={{ gap: 6 }}><span className="spinner" /> calcolo dell'allineamento…</span>}
      </div>}

      {/* ---------- loudness nel tempo ---------- */}
      <section className="section">
        <div className="section-head"><span className="num">01</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Loudness nel tempo</h2></div>
        <div className="chart-wrap">
          <div className="chart-legend"><span className="lg y">A · {A.label}</span><span className="lg">B · {reference ? reference.title : B.label} (tratteggio)</span><span className="lg mute">short-term LUFS</span></div>
          <LoudnessOverlay a={a} b={b} offset={offset} time={time} onSeek={(t) => seekRef.current(t)} />
        </div>
      </section>

      {/* ---------- controlli ---------- */}
      <section className="section">
        <div className="section-head"><span className="num">02</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Controlli tecnici</h2></div>
        {checks.resolved.length + checks.added.length + checks.still.length === 0 && <div className="notice ok">Nessuna segnalazione in nessuna delle due versioni.</div>}
        {checks.resolved.map((c) => <div key={'r' + c.id} className="check ok"><div className="check-dot" /><div className="grow"><b>Risolto in B:</b> {c.title} <span className="mono dim">(A: {c.value})</span></div></div>)}
        {checks.added.map((c) => <div key={'n' + c.id} className="check alert"><div className="check-dot" /><div className="grow"><b>Nuovo in B:</b> {c.title} <span className="mono dim">({c.value})</span></div></div>)}
        {checks.still.map((c) => <div key={'s' + c.id} className="check warn"><div className="check-dot" /><div className="grow"><b>Ancora presente:</b> {c.title} <span className="mono dim">({c.value})</span></div></div>)}
      </section>

      {/* ---------- tabella ---------- */}
      <section className="section">
        <div className="section-head"><span className="num">03</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Differenze misurate</h2></div>
        <p className="dim" style={{ marginTop: -6, fontSize: 13 }}>Δ = B − A. In giallo le differenze rilevanti. Un numero che cambia non è per forza un miglioramento: dipende da cosa volevi ottenere.</p>
        <div className="cmp-table">
          <div className="cmp-row cmp-head"><span>Misura</span><span>A</span><span>B</span><span>Δ</span></div>
          {groups.map((g) => (
            <div key={g}>
              <div className="cmp-group label">{g}</div>
              {rows.filter((r) => r.group === g).map((r) => <MetricLine key={r.label} r={r} />)}
            </div>
          ))}
        </div>
      </section>

      {/* ---------- spettro ---------- */}
      <section className="section">
        <div className="section-head"><span className="num">04</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Spettro</h2></div>
        <div className="chart-wrap">
          <div className="chart-legend"><span className="lg y">A · {A.label}</span><span className="lg">B · {B.label}</span><span className="lg mute">Mid, dB relativi</span></div>
          <SpectrumChart spectra={[
            { label: 'A', color: '#ffd400', freqs: a.spectrum.freqs, values: a.spectrum.mid },
            { label: 'B', color: '#f2f2ee', freqs: b.spectrum.freqs, values: b.spectrum.mid, dashed: true },
          ]} />
        </div>
        <div className="chart-wrap">
          <div className="chart-legend"><span className="lg y">B ha più energia</span><span className="lg dim">B ha meno energia</span><span className="lg mute">bilanciamento tonale a parità di volume</span></div>
          <SpectrumDiffChart points={diff} />
        </div>
      </section>

      {/* ---------- AI ---------- */}
      <section className="section">
        <div className="section-head"><span className="num">AI</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Valutazione del confronto</h2></div>
        <p className="dim" style={{ marginTop: -6, fontSize: 13 }}>L'AI riceve i dati di entrambe le versioni, le tue note sulle versioni e il contesto del progetto. Risponde con verdetto, cosa è migliorato, cosa è peggiorato e prossimi passi.</p>
        <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opzionale: cosa volevi ottenere con la versione B? Es. «più spazio alla voce, bassi più controllati»" />
        <div style={{ marginTop: 10 }}>
          <AiRunner
            label="Confronta con AI"
            disabledReason={project ? undefined : 'Caricamento del progetto…'}
            build={() => ({ task: 'critical', maxTokens: 8192, json: false, ...buildComparePrompt({ project, track, a: A, b: B, offset, userNote: note, reference }) })}
            onResult={async (text) => {
              if (!text.trim()) throw new Error('Risposta vuota.')
              await db.diagnoses.add({ id: uid(), versionId: target, kind: 'confronto', source: 'auto', userNote: `${A.label} → ${reference ? `reference "${reference.title}"` : B.label}${note.trim() ? ` · ${note.trim()}` : ''}`, markdown: text.trim(), createdAt: Date.now() })
            }}
          />
        </div>
        <div style={{ marginTop: 16 }}>{history?.map((d) => <DiagnosisCard key={d.id} d={d} />)}</div>
      </section>
    </>
  )
}

function MetricLine({ r }: { r: MetricRow }) {
  const ok = (v: number | null) => v !== null && Number.isFinite(v)
  const fmt = (v: number | null) => (v === null ? '—' : Number.isFinite(v) ? v.toFixed(r.decimals) : v > 0 ? '+∞' : '−∞')
  const d = ok(r.a) && ok(r.b) ? (r.b as number) - (r.a as number) : null
  const big = d !== null && Math.abs(d) >= r.threshold
  return (
    <div className="cmp-row" title={r.hint}>
      <span>{r.label}{r.unit && <small className="dim"> {r.unit}</small>}</span>
      <span className="mono">{fmt(r.a)}</span>
      <span className="mono">{fmt(r.b)}</span>
      <span className={`mono ${big ? 'y' : 'dim'}`}>{d === null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(r.decimals)}`}</span>
    </div>
  )
}

/* ======================= Lettore A/B ======================= */

/**
 * Le due versioni suonano insieme, sincronizzate; il passaggio A/B
 * cambia solo il guadagno, quindi è istantaneo e alla stessa posizione.
 * Volume allineato: la versione più forte viene abbassata della differenza di LUFS.
 * Usa Web Audio perché su iPhone il volume degli elementi audio non è regolabile.
 */
function ABPlayer({ A, B, offset, lufsA, lufsB, onTime, seekRef }: {
  A: TrackVersion; B: TrackVersion; offset: number; lufsA: number; lufsB: number
  onTime: (t: number) => void; seekRef: React.MutableRefObject<(t: number) => void>
}) {
  const [urls, setUrls] = useState<{ a?: string; b?: string }>({})
  const [active, setActive] = useState<'a' | 'b'>('a')
  const [playing, setPlaying] = useState(false)
  const [matched, setMatched] = useState(true)
  const [t, setT] = useState(0)
  const [err, setErr] = useState('')
  const ea = useRef<HTMLAudioElement>(null), eb = useRef<HTMLAudioElement>(null)
  const graph = useRef<{ ctx: AudioContext; ga: GainNode; gb: GainNode } | null>(null)
  const offRef = useRef(offset); offRef.current = offset

  const diff = Number.isFinite(lufsA) && Number.isFinite(lufsB) ? lufsA - lufsB : 0
  const gainA = matched && diff > 0 ? Math.pow(10, -diff / 20) : 1
  const gainB = matched && diff < 0 ? Math.pow(10, diff / 20) : 1
  const duration = Math.max(A.analysis!.duration, B.analysis!.duration - offset)

  useEffect(() => {
    const made: string[] = []
    Promise.all([db.audioFiles.get(A.id), db.audioFiles.get(B.id)]).then(([fa, fb]) => {
      if (!fa || !fb) { setErr('File audio mancante per una delle versioni.'); return }
      const a = URL.createObjectURL(fa.blob), b = URL.createObjectURL(fb.blob)
      made.push(a, b); setUrls({ a, b })
    })
    return () => { made.forEach((u) => URL.revokeObjectURL(u)); graph.current?.ctx.close() }
  }, [A.id, B.id])

  // aggiorna i guadagni
  useEffect(() => {
    const g = graph.current
    if (!g) return
    const now = g.ctx.currentTime
    g.ga.gain.setTargetAtTime(active === 'a' ? gainA : 0, now, 0.01)
    g.gb.gain.setTargetAtTime(active === 'b' ? gainB : 0, now, 0.01)
  }, [active, gainA, gainB, playing])

  function ensureGraph() {
    if (graph.current || !ea.current || !eb.current) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const ga = ctx.createGain(), gb = ctx.createGain()
    ctx.createMediaElementSource(ea.current).connect(ga).connect(ctx.destination)
    ctx.createMediaElementSource(eb.current).connect(gb).connect(ctx.destination)
    ga.gain.value = active === 'a' ? gainA : 0
    gb.gain.value = active === 'b' ? gainB : 0
    graph.current = { ctx, ga, gb }
  }

  const syncB = (ta: number) => { if (eb.current) eb.current.currentTime = Math.max(0, ta + offRef.current) }

  function seek(ta: number) {
    const x = Math.max(0, Math.min(duration, ta))
    if (ea.current) ea.current.currentTime = x
    syncB(x)
    setT(x); onTime(x)
  }
  seekRef.current = seek

  async function toggle() {
    const a = ea.current, b = eb.current
    if (!a || !b) return
    try {
      ensureGraph()
      await graph.current?.ctx.resume()
      if (playing) { a.pause(); b.pause(); setPlaying(false); return }
      syncB(a.currentTime)
      await Promise.all([a.play(), b.play()])
      setPlaying(true)
    } catch (e) {
      setErr(`Riproduzione non riuscita: ${(e as Error).message}`)
    }
  }

  // testina + correzione della deriva tra i due file
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const a = ea.current, b = eb.current
      if (a && b) {
        const drift = (b.currentTime - offRef.current) - a.currentTime
        if (Math.abs(drift) > 0.04 && a.currentTime + offRef.current >= 0) syncB(a.currentTime)
        setT(a.currentTime); onTime(a.currentTime)
        if (a.ended) { setPlaying(false); return }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, onTime])

  useEffect(() => { if (ea.current) syncB(ea.current.currentTime) }, [offset])

  return (
    <div className="player ab-player">
      {urls.a && <audio ref={ea} src={urls.a} preload="auto" />}
      {urls.b && <audio ref={eb} src={urls.b} preload="auto" />}
      <div className="ab-controls">
        <button className="btn primary ab-play" disabled={!urls.a} onClick={toggle} aria-label={playing ? 'Pausa' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <button className={`ab-btn ${active === 'a' ? 'on' : ''}`} onClick={() => setActive('a')}><b>A</b><span>{A.label}</span></button>
        <button className={`ab-btn ${active === 'b' ? 'on' : ''}`} onClick={() => setActive('b')}><b>B</b><span>{B.label}</span></button>
      </div>
      <div className="row" style={{ marginTop: 10, gap: 10 }}>
        <span className="mono" style={{ fontSize: 12 }}>{fmtTime(t)}</span>
        <input type="range" className="ab-seek" min={0} max={duration} step={0.1} value={t} onChange={(e) => seek(parseFloat(e.target.value))} aria-label="Posizione" />
        <span className="mono dim" style={{ fontSize: 12 }}>{fmtTime(duration)}</span>
      </div>
      <label className="row" style={{ marginTop: 8, gap: 8, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={matched} onChange={(e) => setMatched(e.target.checked)} style={{ accentColor: 'var(--y)', width: 18, height: 18 }} />
        Volume allineato
        <span className="label">{Math.abs(diff) < 0.05 ? 'stessa loudness' : `${diff > 0 ? 'A' : 'B'} abbassata di ${Math.abs(diff).toFixed(1)} dB`}</span>
      </label>
      <div className="label" style={{ marginTop: 4 }}>Il più forte sembra sempre "migliore": con il volume allineato giudichi solo mix e suono.</div>
      {err && <div className="notice err" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  )
}
