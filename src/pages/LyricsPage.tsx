import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from '../lib/db'
import { buildProjectContext } from '../lib/context'
import { analyzeLyrics, lyricsReport, LYRICS_BRAINSTORM_SYSTEM, LYRICS_CRITIC_SYSTEM } from '../lib/music/lyrics'
import AiRunner from '../components/AiRunner'
import AiNotesList from '../components/AiNotesList'

export default function LyricsPage() {
  const { trackId } = useParams()
  const track = useLiveQuery(() => (trackId ? db.tracks.get(trackId) : undefined), [trackId])
  const project = useLiveQuery(() => (track ? db.projects.get(track.projectId) : undefined), [track?.projectId])
  const version = useLiveQuery(async () => {
    if (!trackId) return undefined
    const vs = await db.versions.where('trackId').equals(trackId).sortBy('createdAt')
    return [...vs].reverse().find((v) => v.analysis) ?? null
  }, [trackId])
  const [text, setText] = useState<string | null>(null)
  const [saved, setSaved] = useState(true)
  const [brief, setBrief] = useState('')
  const timer = useRef<number>(0)

  useEffect(() => { if (track && text === null) setText(track.lyrics ?? '') }, [track, text])

  function edit(v: string) {
    setText(v); setSaved(false)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => { await db.tracks.update(trackId!, { lyrics: v, lyricsUpdatedAt: Date.now() }); setSaved(true) }, 700)
  }

  const analysis = useMemo(() => (text && text.trim() ? analyzeLyrics(text) : null), [text])
  const bpm = version?.analysis?.tempo?.bpm

  if (track === undefined || text === null) return <div className="page"><div className="row dim"><div className="spinner" /> Caricamento…</div></div>
  if (!track) return <div className="page"><div className="notice err">Brano non trovato.</div></div>

  const music = version?.analysis ? {
    bpm, duration: version.analysis.duration,
    sections: version.analysis.sections.map((s) => `${s.label} ${Math.round(s.start)}-${Math.round(s.end)}s`).join(', '),
  } : undefined

  const context = () => [
    project ? `CONTESTO DEL PROGETTO\n${buildProjectContext(project)}` : '',
    `BRANO: "${track.title}"${track.notes ? ` — note: ${track.notes}` : ''}`,
    `TESTO ATTUALE:\n${text}`,
    analysis ? lyricsReport(analysis, music) : '',
  ].filter(Boolean).join('\n\n')

  const save = (kind: 'testo-analisi' | 'testo-brainstorming', note: string) => async (md: string) => {
    if (!md.trim()) throw new Error('Risposta vuota.')
    await db.aiNotes.add({ id: uid(), scope: 'track', refId: track.id, kind, userNote: note, markdown: md.trim(), createdAt: Date.now() })
  }

  return (
    <div className="page">
      <div className="label"><Link to="/music">01 / Music Lab</Link> / <Link to={`/music/${track.id}`}>{track.title}</Link> / Testo</div>
      <h1 className="display">Testo e metrica</h1>

      <section className="section">
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="label">Usa [Strofa], [Ritornello]… per le sezioni, oppure separa i blocchi con una riga vuota</span>
          <div className="spacer" /><span className={`label ${saved ? '' : 'y'}`}>{saved ? 'Salvato' : 'Salvataggio…'}</span>
        </div>
        <textarea className="textarea lyrics-editor" rows={14} value={text} onChange={(e) => edit(e.target.value)} placeholder={'[Strofa 1]\nPrima riga\nSeconda riga\n\n[Ritornello]\n…'} spellCheck />
      </section>

      {analysis && (
        <section className="section">
          <div className="section-head"><span className="num">01</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Metrica e rime</h2><div className="spacer" /><span className="tag">calcolato · stima</span></div>
          <p className="dim" style={{ marginTop: -6, fontSize: 13 }}>
            Lingua: {analysis.lang === 'it' ? 'italiano' : 'inglese'}. Sillabe stimate con regole{analysis.lang === 'it' ? ', contando le sinalefi (vocali che si fondono tra due parole quando si canta)' : ' (in inglese la stima è meno precisa)'}.
            Le lettere indicano le rime (x = nessuna rima). In giallo le righe molto più lunghe o corte delle altre della stessa sezione.
          </p>
          <div className="metrics">
            <div className="metric"><div className="label">Righe</div><div className="metric-val">{analysis.totalLines}</div></div>
            <div className="metric"><div className="label">Sillabe</div><div className="metric-val">{analysis.totalSyllables}</div></div>
            <div className="metric"><div className="label">Varietà lessicale</div><div className="metric-val">{Math.round(analysis.uniqueWordRatio * 100)}<small> %</small></div><div className="metric-hint">parole diverse / parole totali</div></div>
            {bpm && <div className="metric"><div className="label">BPM (dal mix)</div><div className="metric-val">{bpm}</div><div className="metric-hint">{version?.label}</div></div>}
          </div>

          {analysis.sections.map((s, si) => {
            const avg = s.lines.reduce((a, l) => a + (analysis.lang === 'it' ? l.sung : l.syllables), 0) / s.lines.length
            const bar = bpm ? 240 / bpm : 0
            const dens1 = bar ? avg / bar : 0
            return (
              <div key={si} className="lyr-sec">
                <div className="row lyr-head">
                  <b>{s.name}</b>
                  <span className="label">schema {s.lines.map((l) => l.rhyme).join('')} · mediana {s.median} sill.</span>
                  {bpm && <span className="label">{dens1.toFixed(1)} sill./s se ogni riga = 1 battuta · {(dens1 / 2).toFixed(1)} se = 2 battute</span>}
                </div>
                {s.lines.map((l, i) => (
                  <div key={i} className={`lyr-line ${l.offMeter ? 'off' : ''}`}>
                    <span className="lyr-n mono">{analysis.lang === 'it' ? l.sung : l.syllables}</span>
                    <span className="lyr-r mono">{l.rhyme}</span>
                    <span className="lyr-t">{l.text}</span>
                  </div>
                ))}
              </div>
            )
          })}
          {bpm && <div className="label" style={{ marginTop: 8 }}>Riferimento: sopra ~6 sillabe al secondo il testo è molto fitto (stile rap); sotto ~2 lascia molto spazio a note lunghe.</div>}

          <div className="grid cols-2" style={{ marginTop: 16 }}>
            <div className="card">
              <div className="label">Parole più ripetute</div>
              <div style={{ marginTop: 8 }}>{analysis.topWords.length ? analysis.topWords.map((w) => <span key={w.word} className="tag" style={{ margin: '0 6px 6px 0' }}>{w.word} ×{w.count}</span>) : <span className="dim">nessuna</span>}</div>
              {analysis.repeatedLines.length > 0 && <><div className="label" style={{ marginTop: 12 }}>Righe ripetute</div>{analysis.repeatedLines.map((r) => <div key={r.text} className="dim" style={{ fontSize: 13 }}>“{r.text}” ×{r.count}</div>)}</>}
            </div>
            <div className="card">
              <div className="label">Possibili cliché <span className="dim">(lista fissa, non esaustiva)</span></div>
              <div style={{ marginTop: 8 }}>{analysis.cliches.length ? analysis.cliches.map((c) => <div key={c.phrase} style={{ fontSize: 13, marginBottom: 6 }}><b className="y">{c.phrase}</b> <span className="dim">— {c.line}</span></div>) : <span className="dim">nessuno trovato</span>}</div>
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head"><span className="num">AI</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Analisi critica</h2></div>
        <p className="dim" style={{ marginTop: -6, fontSize: 13 }}>Immagini, cliché, coerenza con il concept, hook, metrica e cantabilità. Interviene su versi precisi, non riscrive il testo.</p>
        <AiRunner label="Analizza il testo" disabledReason={analysis ? undefined : 'Scrivi prima il testo.'}
          build={() => ({ task: 'critical', maxTokens: 8192, json: false, system: LYRICS_CRITIC_SYSTEM, user: `${context()}\n\nAnalizza il testo seguendo esattamente il formato richiesto.` })}
          onResult={save('testo-analisi', '')} />
      </section>

      <section className="section">
        <div className="section-head"><span className="num">AI</span><h2 className="display" style={{ fontSize: '1.2rem' }}>Brainstorming testo e melodia</h2></div>
        <textarea className="textarea" rows={2} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Su cosa vuoi idee? Es. «un ritornello più spiazzante», «immagini per la seconda strofa», «idee di melodia per l'hook»" />
        <div style={{ marginTop: 10 }}>
          <AiRunner label="Genera idee"
            build={() => ({ task: 'creative', maxTokens: 8192, json: false, system: LYRICS_BRAINSTORM_SYSTEM, user: `${context()}\n\nRICHIESTA: ${brief.trim() || 'idee generali per sviluppare il testo e la melodia'}\n\nRispondi seguendo esattamente il formato richiesto.` })}
            onResult={save('testo-brainstorming', brief.trim())} />
        </div>
      </section>

      <AiNotesList refId={track.id} kinds={['testo-analisi', 'testo-brainstorming']} />
    </div>
  )
}
