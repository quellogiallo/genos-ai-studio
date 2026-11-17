import { useEffect, useRef, useState } from 'react'
import AiRunner from '../AiRunner'
import { useApp } from '../AppState'
import { db } from '../../lib/db'
import { buildContentContext, ideasPrompt, parseIdeas, type ContentSources } from '../../lib/content/prompts'
import { FORMAT_LABEL, PLATFORM_LABEL, fmtSec, type Campaign, type ContentIdea } from '../../lib/content/types'
import { saveCampaign } from '../../lib/content/hooks'
import { nextSlot, postFromIdea } from '../../lib/content/schedule'
import { StepHead, TextField } from '../video/common'

export default function IdeasTab({ c, src }: { c: Campaign; src: ContentSources }) {
  const [n, setN] = useState(3)
  const [brief, setBrief] = useState('')
  const duration = src.version?.analysis?.duration ?? null

  return (
    <section className="section">
      <StepHead num="C2" title="Idee e script" hint="Video brevi pronti da girare: hook dei primi 2 secondi, scaletta secondo per secondo, testo a schermo, momento del brano da usare, caption e hashtag. Solo nei formati che hai scelto." />
      <div className="card">
        <textarea className="textarea" rows={2} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Facoltativo: cosa ti serve? Es. «teaser per la settimana prima dell'uscita», «un loop visual del ritornello»" />
        <div className="row" style={{ marginTop: 10 }}>
          <span className="label">Quante idee</span>
          {[2, 3, 5].map((k) => <button key={k} type="button" className={`chip ${n === k ? 'on' : ''}`} onClick={() => setN(k)}>{k}</button>)}
        </div>
        <div style={{ marginTop: 12 }}>
          <AiRunner label="Genera idee"
            build={() => ideasPrompt(buildContentContext(c, src), c, n, brief.trim(), duration)}
            onResult={async (t) => saveCampaign(c, { ideas: [...parseIdeas(t, duration), ...c.ideas] })} />
        </div>
        {!c.strategy && <div className="label" style={{ marginTop: 10 }}>Le idee sono più coerenti se prima crei la strategia (C1).</div>}
      </div>

      <div className="section">
        {c.ideas.length === 0 && <div className="empty">Nessuna idea ancora.</div>}
        {c.ideas.map((i) => <IdeaCard key={i.id} c={c} idea={i} src={src} />)}
      </div>
    </section>
  )
}

function IdeaCard({ c, idea, src }: { c: Campaign; idea: ContentIdea; src: ContentSources }) {
  const { toast } = useApp()
  const [open, setOpen] = useState(false)
  const inCal = c.posts.filter((p) => p.ideaId === idea.id)
  const patch = (p: Partial<ContentIdea>) => saveCampaign(c, { ideas: c.ideas.map((x) => (x.id === idea.id ? { ...x, ...p } : x)) })

  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); toast(`${what} copiato`) } catch { toast('Il browser ha bloccato la copia', 'err') }
  }
  const scriptText = () => [
    `${idea.title} — ${idea.durationSec}s`, `HOOK: ${idea.hook}`,
    ...idea.beats.map((b) => `${b.from}-${b.to}s · ${b.video}${b.onScreen ? ` · TESTO: ${b.onScreen}` : ''}${b.audio ? ` · AUDIO: ${b.audio}` : ''}`),
    idea.songFrom !== null ? `BRANO: ${fmtSec(idea.songFrom)}–${idea.songTo !== null ? fmtSec(idea.songTo) : '?'}` : '',
    `COME GIRARLO: ${idea.howTo}`,
  ].filter(Boolean).join('\n')

  return (
    <article className="idea">
      <header className="row" style={{ gap: 8, cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
        <span className="tag solid">{idea.platform === 'entrambe' ? 'TikTok + Instagram' : PLATFORM_LABEL[idea.platform]}</span>
        <span className="tag y">{FORMAT_LABEL[idea.format]?.split(' (')[0] ?? idea.format}</span>
        {idea.pillar && <span className="tag">{idea.pillar}</span>}
        <span className="label">{idea.durationSec}s</span>
        {inCal.length > 0 && <span className="label y">in calendario · {inCal.map((p) => new Date(p.date + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })).join(', ')}</span>}
      </header>
      <h3 className="display" style={{ fontSize: '1.2rem', margin: '10px 0 6px' }}>{idea.title}</h3>
      <div className="hook"><span className="label">Hook · 0–2s</span><div>{idea.hook}</div></div>

      {open && <>
        {idea.beats.length > 0 && (
          <div className="beats">
            {idea.beats.map((b, k) => (
              <div key={k} className="beat-row">
                <span className="mono y">{b.from}–{b.to}s</span>
                <span>{b.video}{b.onScreen && <><br /><span className="onscreen">“{b.onScreen}”</span></>}{b.audio && <><br /><span className="dim" style={{ fontSize: 12 }}>♪ {b.audio}</span></>}</span>
              </div>
            ))}
          </div>
        )}
        {idea.songFrom !== null && (
          <div className="card" style={{ marginTop: 12, padding: 12 }}>
            <div className="row"><span className="label">Momento del brano</span><b className="mono">{fmtSec(idea.songFrom)}–{idea.songTo !== null ? fmtSec(idea.songTo) : '?'}</b>
              {src.version && <SegmentPlayer versionId={src.version.id} from={idea.songFrom} to={idea.songTo ?? idea.songFrom + idea.durationSec} />}</div>
            {idea.songWhy && <div className="dim" style={{ fontSize: 13, marginTop: 4 }}>{idea.songWhy}</div>}
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <TextField label="Caption" multiline rows={3} value={idea.caption} onSave={(caption) => patch({ caption })} />
          <TextField label="Hashtag" value={idea.hashtags.join(' ')} onSave={(v) => patch({ hashtags: v.split(/\s+/).filter(Boolean).map((h) => (h.startsWith('#') ? h : `#${h}`)) })} />
          {idea.cta && <p style={{ fontSize: 13 }}><b className="y">Invito all'azione:</b> {idea.cta}</p>}
          {idea.howTo && <p style={{ fontSize: 13 }}><b className="y">Come girarlo:</b> {idea.howTo}</p>}
          {idea.why && <p style={{ fontSize: 13 }}><b className="y">Perché funziona:</b> {idea.why}</p>}
          {idea.limits && <p style={{ fontSize: 13 }}><b className="y">Limiti:</b> {idea.limits}</p>}
        </div>
      </>}

      <div className="row" style={{ marginTop: 10, gap: 6 }}>
        <button className="btn ghost sm" type="button" onClick={() => setOpen((o) => !o)}>{open ? 'Chiudi' : 'Script completo'}</button>
        <button className="btn sm" type="button" onClick={async () => {
          const d = nextSlot(c, c.posts)
          await saveCampaign(c, { posts: [...c.posts, postFromIdea(c, idea, d)].sort((a, b) => a.date.localeCompare(b.date)) })
          toast(`Messo in calendario il ${new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}`)
        }}>+ Calendario</button>
        <button className="btn ghost sm" type="button" onClick={() => copy(scriptText(), 'Script')}>Copia script</button>
        <button className="btn ghost sm" type="button" onClick={() => copy(`${idea.caption}\n\n${idea.hashtags.join(' ')}`, 'Caption')}>Copia caption</button>
        <button className="btn ghost sm" type="button" aria-label="Elimina idea" onClick={() => { if (confirm(`Eliminare l'idea "${idea.title}"${inCal.length ? ' e i suoi post in calendario' : ''}?`)) saveCampaign(c, { ideas: c.ideas.filter((x) => x.id !== idea.id), posts: c.posts.filter((p) => p.ideaId !== idea.id) }) }}>×</button>
      </div>
    </article>
  )
}

/** Riproduce solo il tratto del brano scelto (se il file audio è su questo dispositivo). */
function SegmentPlayer({ versionId, from, to }: { versionId: string; from: number; to: number }) {
  const [url, setUrl] = useState<string | null | undefined>()
  const [playing, setPlaying] = useState(false)
  const el = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    let u: string | undefined
    db.audioFiles.get(versionId).then((f) => { if (f) { u = URL.createObjectURL(f.blob); setUrl(u) } else setUrl(null) })
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [versionId])
  useEffect(() => {
    const a = el.current
    if (!a) return
    const tick = () => { if (a.currentTime >= to) { a.pause(); setPlaying(false) } }
    a.addEventListener('timeupdate', tick)
    return () => a.removeEventListener('timeupdate', tick)
  }, [url, to])
  if (url === null) return <span className="label" style={{ marginLeft: 'auto' }}>audio non su questo dispositivo</span>
  if (!url) return null
  return (
    <>
      <audio ref={el} src={url} preload="auto" />
      <button className="btn sm" type="button" style={{ marginLeft: 'auto' }} onClick={async () => {
        const a = el.current!
        if (playing) { a.pause(); setPlaying(false); return }
        a.currentTime = from
        try { await a.play(); setPlaying(true) } catch { setPlaying(false) }
      }}>{playing ? '■ Stop' : '▶ Ascolta il taglio'}</button>
    </>
  )
}
