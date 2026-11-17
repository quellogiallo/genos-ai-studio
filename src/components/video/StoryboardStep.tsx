import { useState } from 'react'
import AiRunner from '../AiRunner'
import { buildVideoContext, parseStoryboard, storyboardPrompt } from '../../lib/video/prompts'
import { fmtDur, type Shot } from '../../lib/video/types'
import { StepHead, type StepProps } from './common'
import { DurationCheck, ShotCard, newShot, shotsOf } from './shots'

export default function StoryboardStep({ video, project, track, update }: StepProps) {
  const [target, setTarget] = useState<string>('all')
  const [note, setNote] = useState('')
  const shots = video.shots ?? []

  const setShots = (next: Shot[]) => update({ shots: next })
  const patch = (id: string, p: Partial<Shot>) => setShots(shots.map((s) => (s.id === id ? { ...s, ...p } : s)))

  function move(id: string, dir: -1 | 1) {
    const s = shots.find((x) => x.id === id)!
    const same = shots.filter((x) => x.sceneId === s.sceneId)
    const i = same.indexOf(s), j = i + dir
    if (j < 0 || j >= same.length) return
    const other = same[j]
    const a = shots.indexOf(s), b = shots.indexOf(other)
    const next = [...shots]; next[a] = other; next[b] = s
    setShots(next)
  }

  if (!video.scenes.length) {
    return (
      <section className="section">
        <StepHead num="06" title="Storyboard" hint="Ogni scena divisa in inquadrature." />
        <div className="notice">Serve prima la sceneggiatura (passo 05).</div>
      </section>
    )
  }

  const sceneIds = target === 'all' ? video.scenes.map((s) => s.id) : [target]
  const hasExisting = shots.some((s) => sceneIds.includes(s.sceneId))

  return (
    <section className="section">
      <StepHead num="06" title="Storyboard"
        hint="Ogni scena divisa in inquadrature: piano, angolazione, movimento, durata e transizione. Tocca un fotogramma per caricare uno schizzo o un'immagine; senza immagine vedi lo schema dell'inquadratura." />

      <div className="card">
        <div className="row" style={{ alignItems: 'stretch', marginBottom: 10 }}>
          <select className="select" style={{ flex: '1 1 200px', width: 'auto' }} value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Scene da dividere">
            <option value="all">Tutte le scene</option>
            {video.scenes.map((s, i) => <option key={s.id} value={s.id}>Scena {i + 1}{s.title ? ` — ${s.title}` : ''}</option>)}
          </select>
          <input className="input" style={{ flex: '2 1 220px' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Indicazione facoltativa (es. più camera a mano nel ritornello)" />
        </div>
        <AiRunner
          label={hasExisting ? 'Rigenera inquadrature' : 'Genera inquadrature'}
          build={() => {
            if (hasExisting && !confirm('Rigenerare sostituisce le inquadrature delle scene scelte (anche prompt e immagini collegate). Continuare?')) throw new Error('Operazione annullata.')
            return storyboardPrompt(buildVideoContext(video, project, track, 'storyboard'), video, sceneIds, note.trim())
          }}
          onResult={async (text) => {
            const byScene = parseStoryboard(text, video, video.techniques)
            // sostituisce solo le scene presenti nella risposta, mantenendo l'ordine delle scene
            const replaced = new Set(byScene.keys())
            const next: Shot[] = []
            for (const sc of video.scenes) next.push(...(replaced.has(sc.id) ? byScene.get(sc.id)! : shots.filter((s) => s.sceneId === sc.id)))
            await setShots(next)
          }}
        />
      </div>

      {video.scenes.map((sc, i) => {
        const list = shotsOf(video, sc.id)
        return (
          <div key={sc.id} className="sb-scene">
            <div className="sb-head">
              <span className="scene-num">{String(i + 1).padStart(2, '0')}</span>
              <div className="grow"><b>{sc.title || 'Senza titolo'}</b><div className="label">{sc.setting}{sc.music ? ` · ${sc.music}` : ''} · {fmtDur(sc.durationSec)}</div></div>
              <DurationCheck scene={sc} shots={list} />
            </div>
            <div className="sb-grid">
              {list.map((t, j) => (
                <ShotCard key={t.id} shot={t} code={`${i + 1}.${j + 1}`} video={video}
                  onChange={(p) => patch(t.id, p)} onDelete={() => setShots(shots.filter((x) => x.id !== t.id))} onMove={(d) => move(t.id, d)} />
              ))}
              <button className="shot add" type="button" onClick={() => setShots([...shots, newShot(sc.id, video.techniques[0] ?? 'reale')])}>+ Inquadratura</button>
            </div>
          </div>
        )
      })}
    </section>
  )
}
