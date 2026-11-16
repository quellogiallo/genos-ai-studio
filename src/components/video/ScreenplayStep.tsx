import { useState } from 'react'
import AiRunner from '../AiRunner'
import { useApp } from '../AppState'
import { uid } from '../../lib/db'
import { buildVideoContext, parseScreenplay, screenplayPrompt } from '../../lib/video/prompts'
import { fmtDur, type Scene } from '../../lib/video/types'
import { InlineInput, StepHead, TextField, type StepProps } from './common'

export default function ScreenplayStep({ video, project, track, update }: StepProps) {
  const { toast } = useApp()
  const [note, setNote] = useState('')
  const [missing, setMissing] = useState<string[]>([])

  const names = video.sheets.map((s) => s.name)
  const total = video.scenes.reduce((n, s) => n + s.durationSec, 0)
  const target = track?.analysis ? Math.round(track.analysis.duration) : video.targetSec
  const diff = target ? total - target : 0
  // controllo di coerenza reale: nomi citati nelle scene che non hanno una scheda
  const unknown = [...new Set(video.scenes.flatMap((s) => s.sheets).filter((n) => !names.includes(n)))]

  const patch = (id: string, p: Partial<Scene>) => update({ scenes: video.scenes.map((s) => (s.id === id ? { ...s, ...p } : s)) })

  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= video.scenes.length) return
    const next = [...video.scenes]
    ;[next[i], next[j]] = [next[j], next[i]]
    update({ scenes: next })
  }

  function addScene() {
    update({ scenes: [...video.scenes, { id: uid(), title: '', setting: '', time: '', action: '', sheets: [], music: '', durationSec: 0, intent: '' }] })
  }

  async function copyText() {
    const lines = [`${video.title.toUpperCase()} — SCENEGGIATURA`, video.arc ? `\n${video.arc}` : '']
    video.scenes.forEach((s, i) => {
      lines.push(`\n${i + 1}. ${s.setting.toUpperCase()}${s.time ? ` — ${s.time.toUpperCase()}` : ''}  [${fmtDur(s.durationSec)}]`)
      if (s.title) lines.push(s.title)
      if (s.music) lines.push(`Musica: ${s.music}`)
      if (s.sheets.length) lines.push(`Con: ${s.sheets.join(', ')}`)
      lines.push(s.action)
    })
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast('Sceneggiatura copiata')
    } catch {
      toast('Il browser ha bloccato la copia negli appunti', 'err')
    }
  }

  return (
    <section className="section">
      <StepHead num="05" title="Sceneggiatura"
        hint="Cosa si vede e cosa succede, scena per scena. Niente inquadrature qui: arrivano nello storyboard. Le scene usano solo le schede condivise." />

      {video.sheets.length === 0 && <div className="notice" style={{ marginBottom: 16 }}>Non ci sono schede condivise: la sceneggiatura non avrà personaggi e ambienti coerenti a cui riferirsi.</div>}

      <div className="card">
        <input className="input" style={{ marginBottom: 12 }} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Indicazione facoltativa (es. niente narrazione lineare, finale aperto)" />
        <AiRunner
          label={video.scenes.length ? 'Riscrivi la sceneggiatura' : 'Scrivi la sceneggiatura'}
          build={() => {
            if (video.scenes.length && !confirm('Riscrivere sostituisce tutte le scene attuali. Continuare?')) throw new Error('Operazione annullata: le scene attuali restano.')
            return screenplayPrompt(buildVideoContext(video, project, track, 'screenplay'), note.trim(), !!track?.analysis)
          }}
          onResult={async (text) => {
            const r = parseScreenplay(text)
            await update({ scenes: r.scenes, arc: r.arc })
            setMissing(r.missing)
          }}
        />
      </div>

      {missing.length > 0 && (
        <div className="notice" style={{ marginTop: 16 }}>
          L'AI segnala elementi senza scheda: <b>{missing.join(', ')}</b>. Creali nel passo 04 per mantenerli coerenti.
          <button className="btn ghost sm" type="button" style={{ marginLeft: 10 }} onClick={() => setMissing([])}>Ok</button>
        </div>
      )}

      {video.scenes.length > 0 && (
        <>
          <div className="section">
            <TextField label="Arco del video" multiline rows={3} value={video.arc} onSave={(arc) => update({ arc })} />
          </div>

          <div className="metrics">
            <div className="metric"><div className="label">Scene</div><div className="metric-val">{video.scenes.length}</div></div>
            <div className="metric"><div className="label">Durata totale</div><div className="metric-val">{fmtDur(total)}</div></div>
            <div className="metric">
              <div className="label">{track?.analysis ? 'Durata del brano' : 'Durata prevista'}</div>
              <div className="metric-val">{target ? fmtDur(target) : '—'}</div>
              {target > 0 && (
                <div className="metric-hint" style={Math.abs(diff) > 5 ? { color: 'var(--red)' } : { color: 'var(--green)' }}>
                  {Math.abs(diff) <= 5 ? 'Allineata' : diff > 0 ? `${fmtDur(diff)} di troppo` : `mancano ${fmtDur(-diff)}`}
                </div>
              )}
            </div>
          </div>

          {unknown.length > 0 && (
            <div className="notice err" style={{ marginTop: 16 }}>
              Incoerenza: le scene citano <b>{unknown.join(', ')}</b>, che non {unknown.length === 1 ? 'ha' : 'hanno'} una scheda. Crea la scheda o togli il nome dalla scena.
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 16 }}>
        {video.scenes.map((s, i) => (
          <div key={s.id} className="scene">
            <div className="scene-head">
              <span className="scene-num">{String(i + 1).padStart(2, '0')}</span>
              <div className="grow"><InlineInput value={s.title} placeholder="Titolo della scena" onSave={(title) => patch(s.id, { title })} style={{ fontWeight: 800 }} /></div>
              <button className="btn ghost sm" type="button" aria-label="Sposta su" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="btn ghost sm" type="button" aria-label="Sposta giù" disabled={i === video.scenes.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="btn ghost sm" type="button" aria-label="Elimina scena"
                onClick={() => { if (confirm(`Eliminare la scena ${i + 1}?`)) update({ scenes: video.scenes.filter((x) => x.id !== s.id) }) }}>×</button>
            </div>
            <div className="scene-body">
              <div className="row" style={{ alignItems: 'stretch', marginBottom: 12 }}>
                <InlineInput style={{ flex: '2 1 180px' }} value={s.setting} placeholder="INT / EST + luogo" onSave={(setting) => patch(s.id, { setting })} />
                <InlineInput style={{ flex: '1 1 110px' }} value={s.time} placeholder="Momento" onSave={(time) => patch(s.id, { time })} />
                <InlineInput style={{ flex: '0 1 96px' }} type="number" min={0} value={String(s.durationSec || '')} placeholder="Sec"
                  onSave={(v) => patch(s.id, { durationSec: Math.max(0, Math.round(Number(v) || 0)) })} />
              </div>
              <TextField label="Azione" multiline rows={4} value={s.action} onSave={(action) => patch(s.id, { action })} placeholder="Cosa si vede e cosa succede" />
              <div className="grid cols-2">
                <TextField label="Musica" value={s.music} onSave={(music) => patch(s.id, { music })} placeholder="Sezione del brano / tempi" />
                <TextField label="Intento" value={s.intent} onSave={(intent) => patch(s.id, { intent })} placeholder="Cosa deve arrivare allo spettatore" />
              </div>
              <div className="label" style={{ marginBottom: 6 }}>Schede in scena</div>
              <div className="filters" style={{ margin: 0 }}>
                {names.map((n) => {
                  const on = s.sheets.includes(n)
                  return (
                    <button key={n} type="button" className={`tag ${on ? 'solid' : ''}`} aria-pressed={on}
                      onClick={() => patch(s.id, { sheets: on ? s.sheets.filter((x) => x !== n) : [...s.sheets, n] })}>{n}</button>
                  )
                })}
                {s.sheets.filter((n) => !names.includes(n)).map((n) => (
                  <button key={n} type="button" className="tag bad" title="Nessuna scheda con questo nome: tocca per toglierlo"
                    onClick={() => patch(s.id, { sheets: s.sheets.filter((x) => x !== n) })}>{n} ×</button>
                ))}
                {names.length === 0 && s.sheets.length === 0 && <span className="label">Nessuna scheda disponibile</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn" type="button" onClick={addScene}>+ Scena</button>
        {video.scenes.length > 0 && <button className="btn ghost" type="button" onClick={copyText}>Copia come testo</button>}
      </div>
    </section>
  )
}
