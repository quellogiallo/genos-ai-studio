import { useRef, useState } from 'react'
import AiRunner from '../AiRunner'
import Amber from '../Amber'
import { useApp } from '../AppState'
import { db, uid } from '../../lib/db'
import { storeImage } from '../../lib/video/hooks'
import { buildVideoContext, moodSearchPrompt, parseMoodSearch } from '../../lib/video/prompts'
import { MOOD_TAGS, type MoodItem, type MoodTag } from '../../lib/video/types'
import { Chips, StepHead, StoredImage, Swatches, TextField, type StepProps } from './common'

export default function MoodboardStep({ video, project, track, update }: StepProps) {
  const { toast } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(0)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<MoodTag | 'tutte'>('tutte')
  const [link, setLink] = useState('')

  async function addFiles(files: FileList) {
    const added: MoodItem[] = []
    setBusy(files.length); setTotal(files.length)
    for (const f of Array.from(files)) {
      try {
        const { imageId, colors } = await storeImage(video.id, f)
        added.push({ id: uid(), kind: 'image', imageId, colors, tag: filter === 'tutte' ? 'altro' : filter, note: '', createdAt: Date.now() })
      } catch (e) {
        toast((e as Error).message, 'err')
      }
      setBusy((n) => n - 1)
    }
    setBusy(0)
    if (added.length) {
      await update({ mood: [...video.mood, ...added] })
      toast(`${added.length} ${added.length === 1 ? 'immagine aggiunta' : 'immagini aggiunte'}`)
    }
  }

  function addLink(e: React.FormEvent) {
    e.preventDefault()
    const url = link.trim()
    if (!/^https?:\/\/\S+$/i.test(url)) { toast('Incolla un indirizzo completo che inizia con http', 'err'); return }
    update({ mood: [...video.mood, { id: uid(), kind: 'link', url, tag: filter === 'tutte' ? 'altro' : filter, note: '', createdAt: Date.now() }] })
    setLink('')
  }

  const patch = (id: string, p: Partial<MoodItem>) => update({ mood: video.mood.map((m) => (m.id === id ? { ...m, ...p } : m)) })

  async function remove(m: MoodItem) {
    if (m.imageId) await db.videoImages.delete(m.imageId)
    await update({ mood: video.mood.filter((x) => x.id !== m.id) })
  }

  const shown = video.mood.filter((m) => filter === 'tutte' || m.tag === filter)
  const counts = (t: MoodTag) => video.mood.filter((m) => m.tag === t).length

  return (
    <section className="section">
      <StepHead num="03" title="Moodboard"
        hint="Raccogli qui le reference visive: immagini caricate da te e link. L'app misura i colori dominanti di ogni immagine. Le note che scrivi vengono lette dall'AI nei passi successivi; le immagini no." />

      {video.direction && (
        <div style={{ marginBottom: 16 }}>
          <div className="label" style={{ marginBottom: 6 }}>Palette della direzione · {video.direction.name}</div>
          <Swatches palette={video.direction.palette} />
        </div>
      )}

      <div className="card">
        <div className="row">
          <button className="btn primary" type="button" disabled={busy > 0} onClick={() => fileRef.current?.click()}>
            {busy > 0 ? <><div className="spinner" /> Carico…</> : '+ Immagini'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = '' }} />
          <form className="row" style={{ flex: '1 1 260px', alignItems: 'stretch' }} onSubmit={addLink}>
            <input className="input" style={{ flex: 1 }} type="url" inputMode="url" placeholder="oppure incolla un link" value={link} onChange={(e) => setLink(e.target.value)} />
            <button className="btn sm" disabled={!link.trim()}>Aggiungi</button>
          </form>
        </div>
        {busy > 0 && <Amber pct={((total - busy) / Math.max(1, total)) * 100} label={`Carico le immagini · ${total - busy + 1} di ${total}`} />}
      </div>

      <div className="filters">
        <button type="button" className={`tag ${filter === 'tutte' ? 'solid' : ''}`} onClick={() => setFilter('tutte')}>Tutte · {video.mood.length}</button>
        {MOOD_TAGS.map((t) => (
          <button key={t} type="button" className={`tag ${filter === t ? 'solid' : ''}`} onClick={() => setFilter(t)}>{t} · {counts(t)}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty">{video.mood.length ? 'Nessuna reference in questa categoria.' : 'Moodboard vuota. Carica le prime immagini o chiedi all\'AI cosa cercare.'}</div>
      ) : (
        <div className="mood-grid">
          {shown.map((m) => (
            <div key={m.id} className="mood-item">
              {m.kind === 'image'
                ? <StoredImage imageId={m.imageId} alt={m.note || 'Reference'} className="mood-img" />
                : <a className="mood-link" href={m.url} target="_blank" rel="noreferrer">{m.url?.replace(/^https?:\/\/(www\.)?/, '')} ↗</a>}
              <Chips colors={m.colors} />
              <div className="mood-body">
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <select className="select" style={{ fontSize: 13, padding: '6px 28px 6px 8px' }} value={m.tag} aria-label="Categoria"
                    onChange={(e) => patch(m.id, { tag: e.target.value as MoodTag })}>
                    {MOOD_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button className="btn ghost sm" type="button" aria-label="Elimina reference" onClick={() => remove(m)}>×</button>
                </div>
                <TextField multiline rows={2} value={m.note} placeholder="Cosa prendi da questa reference?" onSave={(note) => patch(m.id, { note })} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: 24 }}>
        <div className="label" style={{ marginBottom: 8 }}>Cosa cercare</div>
        <p className="dim" style={{ fontSize: 13, marginTop: 0 }}>L'AI non vede e non genera immagini qui: ti dice quali reference cercare, e perché servono al video.</p>
        <AiRunner
          label={video.moodSearch.length ? 'Rigenera i suggerimenti' : 'Suggerisci cosa cercare'}
          build={() => moodSearchPrompt(buildVideoContext(video, project, track, 'moodsearch'))}
          onResult={(text) => update({ moodSearch: parseMoodSearch(text) })}
        />
        {video.moodSearch.map((s) => (
          <div key={s.id} className="list-item">
            <span className="tag y">{s.tag}</span>
            <div className="grow"><b>{s.what}</b><div className="dim" style={{ fontSize: 13 }}>{s.why}</div></div>
            <button className="btn ghost sm" type="button" aria-label="Rimuovi" onClick={() => update({ moodSearch: video.moodSearch.filter((x) => x.id !== s.id) })}>×</button>
          </div>
        ))}
      </div>
    </section>
  )
}
