import { useState } from 'react'
import { useApp } from '../AppState'
import { uid } from '../../lib/db'
import { saveCampaign } from '../../lib/content/hooks'
import { autoSchedule, nextSlot, toIcs, weekLimit, weekStart } from '../../lib/content/schedule'
import { PLATFORM_LABEL, STATUSES, STATUS_LABEL, addDays, dayOffset, type Campaign, type Platform, type Post, type PostStatus } from '../../lib/content/types'
import { StepHead } from '../video/common'

const dLabel = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + 'T12:00:00').toLocaleDateString('it-IT', opts)

export default function CalendarTab({ c }: { c: Campaign }) {
  const { toast } = useApp()
  const [view, setView] = useState<'lista' | 'mese'>('lista')
  const [month, setMonth] = useState(() => (c.posts[0]?.date ?? c.releaseDate).slice(0, 7))
  const posts = [...c.posts].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const set = (next: Post[]) => saveCampaign(c, { posts: next })
  const patch = (id: string, p: Partial<Post>) => set(c.posts.map((x) => (x.id === id ? { ...x, ...p } : x)))
  const unplanned = c.ideas.filter((i) => !c.posts.some((p) => p.ideaId === i.id))
  const phaseOf = (date: string) => { const o = dayOffset(date, c.releaseDate); return c.strategy?.phases.find((p) => o >= p.fromDay && o <= p.toDay)?.name }

  function exportIcs() {
    const todo = posts.filter((p) => p.status !== 'pubblicato')
    if (!todo.length) { toast('Nessun contenuto da esportare', 'err'); return }
    const blob = new Blob([toIcs(c, todo)], { type: 'text/calendar' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${c.title.replace(/[^\w\- ]+/g, '').trim() || 'campagna'}.ics`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  }

  // raggruppamento per settimana
  const weeks = new Map<string, Post[]>()
  posts.forEach((p) => { const w = weekStart(p.date); weeks.set(w, [...(weeks.get(w) ?? []), p]) })
  const done = posts.filter((p) => p.status === 'pubblicato').length

  return (
    <section className="section">
      <StepHead num="C3" title="Calendario" hint={`Cosa pubblicare e quando, con il conto alla rovescia verso l'uscita. Il calendario rispetta il tuo ritmo di ${c.perWeek} contenuti a settimana (e quello di ogni fase della strategia).`} />
      <div className="card">
        <div className="row">
          <button className="btn primary sm" type="button" disabled={!unplanned.length} onClick={() => { set(autoSchedule(c)); toast(`${unplanned.length} idee messe in calendario`) }}>Pianifica le idee ({unplanned.length})</button>
          <button className="btn sm" type="button" onClick={() => set([...c.posts, { id: uid(), title: 'Nuovo contenuto', date: nextSlot(c, c.posts), time: '', platform: c.platforms[0] ?? 'tiktok', status: 'idea', notes: '', url: '' }])}>+ Contenuto</button>
          <button className="btn ghost sm" type="button" onClick={exportIcs}>Esporta nel calendario del telefono</button>
        </div>
        <div className="label" style={{ marginTop: 8 }}>L'export crea un file .ics: aprilo sul telefono per aggiungere i contenuti al tuo calendario (iPhone: Calendario; Android: Google Calendar).</div>
      </div>

      {posts.length > 0 && <>
        <div className="row section">
          <div className="tabs" style={{ flex: '0 0 220px', borderBottom: 0 }}>
            <button className={view === 'lista' ? 'on' : ''} onClick={() => setView('lista')}>Lista</button>
            <button className={view === 'mese' ? 'on' : ''} onClick={() => setView('mese')}>Mese</button>
          </div>
          <div className="spacer" />
          <span className="label">{done}/{posts.length} pubblicati</span>
        </div>

        {view === 'lista' && [...weeks.entries()].map(([w, list]) => {
          const lim = weekLimit(c, w)
          const over = list.length > lim
          return (
            <div key={w} className="week">
              <div className="week-head">
                <b>Settimana del {dLabel(w, { day: 'numeric', month: 'short' })}</b>
                {phaseOf(w) && <span className="tag y">{phaseOf(w)}</span>}
                <div className="spacer" />
                <span className="label" style={over ? { color: 'var(--red)' } : undefined}>{list.length}/{lim}{over ? ' · troppi' : ''}</span>
              </div>
              {list.map((p) => <PostRow key={p.id} p={p} c={c} onPatch={(x) => patch(p.id, x)} onDelete={() => set(c.posts.filter((x) => x.id !== p.id))} />)}
            </div>
          )
        })}

        {view === 'mese' && <MonthGrid c={c} posts={posts} month={month} setMonth={setMonth} />}
      </>}
      {!posts.length && <div className="empty section">Il calendario è vuoto. Genera delle idee (C2) e premi “Pianifica le idee”, oppure aggiungi un contenuto a mano.</div>}
    </section>
  )
}

function PostRow({ p, c, onPatch, onDelete }: { p: Post; c: Campaign; onPatch: (x: Partial<Post>) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const off = dayOffset(p.date, c.releaseDate)
  const idea = c.ideas.find((i) => i.id === p.ideaId)
  return (
    <div className={`post st-${p.status}`}>
      <div className="post-main" onClick={() => setOpen((o) => !o)}>
        <div className="post-date"><b>{dLabel(p.date, { weekday: 'short', day: 'numeric' })}</b><span className="mono">{off === 0 ? 'USCITA' : off < 0 ? `D${off}` : `D+${off}`}</span></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <b>{p.title}</b>
          <div className="label">{PLATFORM_LABEL[p.platform]}{p.time ? ` · ${p.time}` : ''}{idea ? ` · ${idea.durationSec}s` : ''}</div>
        </div>
        <select className="sl-select" value={p.status} onClick={(e) => e.stopPropagation()} onChange={(e) => onPatch({ status: e.target.value as PostStatus })} aria-label="Stato">
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      {open && (
        <div className="post-edit">
          <div className="row" style={{ alignItems: 'stretch' }}>
            <input className="input" style={{ flex: '2 1 200px' }} value={p.title} onChange={(e) => onPatch({ title: e.target.value })} aria-label="Titolo" />
            <input type="date" className="input" style={{ flex: '1 1 140px' }} value={p.date} onChange={(e) => e.target.value && onPatch({ date: e.target.value })} aria-label="Data" />
            <input type="time" className="input" style={{ flex: '0 1 110px' }} value={p.time} onChange={(e) => onPatch({ time: e.target.value })} aria-label="Ora" />
            <select className="select" style={{ flex: '0 1 140px', width: 'auto' }} value={p.platform} onChange={(e) => onPatch({ platform: e.target.value as Platform })} aria-label="Piattaforma">
              {c.platforms.map((x) => <option key={x} value={x}>{PLATFORM_LABEL[x]}</option>)}
            </select>
          </div>
          <input className="input" style={{ marginTop: 8 }} value={p.url} onChange={(e) => onPatch({ url: e.target.value })} placeholder="Link al post pubblicato (serve per collegare le statistiche)" />
          <textarea className="textarea" rows={2} style={{ marginTop: 8 }} value={p.notes} onChange={(e) => onPatch({ notes: e.target.value })} placeholder="Note" />
          {idea && <div className="dim" style={{ fontSize: 13, marginTop: 6 }}><b className="y">Hook:</b> {idea.hook}</div>}
          <div className="row" style={{ marginTop: 8 }}>
            {p.url && <a className="btn ghost sm" href={p.url} target="_blank" rel="noreferrer">Apri post ↗</a>}
            <div className="spacer" />
            <button className="btn danger sm" type="button" onClick={() => { if (confirm('Togliere questo contenuto dal calendario?')) onDelete() }}>Togli dal calendario</button>
          </div>
        </div>
      )}
    </div>
  )
}

function MonthGrid({ c, posts, month, setMonth }: { c: Campaign; posts: Post[]; month: string; setMonth: (m: string) => void }) {
  const first = `${month}-01`
  const start = weekStart(first)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const shift = (n: number) => { const d = new Date(first + 'T12:00:00'); d.setMonth(d.getMonth() + n); setMonth(d.toISOString().slice(0, 7)) }
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="section">
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn ghost sm" type="button" onClick={() => shift(-1)} aria-label="Mese precedente">←</button>
        <b style={{ textTransform: 'capitalize' }}>{dLabel(first, { month: 'long', year: 'numeric' })}</b>
        <button className="btn ghost sm" type="button" onClick={() => shift(1)} aria-label="Mese successivo">→</button>
      </div>
      <div className="month">
        {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((d) => <div key={d} className="month-dow">{d}</div>)}
        {days.map((d) => {
          const list = posts.filter((p) => p.date === d)
          return (
            <div key={d} className={`month-cell ${d.slice(0, 7) !== month ? 'out' : ''} ${d === c.releaseDate ? 'release' : ''} ${d === today ? 'today' : ''}`}>
              <span className="month-n">{Number(d.slice(8))}</span>
              {d === c.releaseDate && <span className="month-rel">USCITA</span>}
              {list.map((p) => <span key={p.id} className={`month-post st-${p.status}`} title={p.title}>{p.platform === 'tiktok' ? 'TT' : 'IG'} {p.title}</span>)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
