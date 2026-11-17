import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../components/AppState'
import { Dot, useOpenIn } from '../components/pm/common'
import { PmTabs } from './ProjectsPage'
import { projectColors } from '../lib/pm/timeline'
import { AREA_LABEL, buildIndex, norm, search, type Area, type Entry } from '../lib/pm/search'

const AREAS = Object.keys(AREA_LABEL) as Area[]

/** Evidenzia le parole cercate nello snippet. */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const n = norm(text)
  const marks: [number, number][] = []
  for (const t of terms) { let i = n.indexOf(t); while (i >= 0) { marks.push([i, i + t.length]); i = n.indexOf(t, i + t.length) } }
  marks.sort((a, b) => a[0] - b[0])
  const out: React.ReactNode[] = []
  let pos = 0
  marks.forEach(([a, b], k) => { if (a < pos) return; out.push(text.slice(pos, a), <mark key={k}>{text.slice(a, b)}</mark>); pos = b })
  out.push(text.slice(pos))
  return <>{out}</>
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const { activeProject } = useApp()
  const open = useOpenIn()
  const projects = useLiveQuery(() => db.projects.toArray(), [])
  const [q, setQ] = useState(params.get('q') ?? '')
  const [scope, setScope] = useState<string>(params.get('p') ?? 'tutti')
  const [area, setArea] = useState<Area | null>(null)
  const [index, setIndex] = useState<Entry[] | null>(null)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])

  // l'indice si ricostruisce quando cambiano i progetti (e ad ogni apertura della pagina)
  useEffect(() => {
    if (!projects) return
    let alive = true
    const list = scope === 'tutti' ? projects : projects.filter((p) => p.id === scope)
    buildIndex(list).then((ix) => { if (alive) setIndex(ix) }).catch((e) => setError((e as Error).message))
    return () => { alive = false }
  }, [projects, scope])

  // la query va nell'indirizzo (si può tornare indietro alla ricerca)
  useEffect(() => {
    const h = setTimeout(() => setParams((prev) => { const n = new URLSearchParams(prev); if (q) n.set('q', q); else n.delete('q'); return n }, { replace: true }), 300)
    return () => clearTimeout(h)
  }, [q, setParams])

  const hits = useMemo(() => (index ? search(index, q) : []), [index, q])
  const terms = [...q.matchAll(/"([^"]+)"|(\S+)/g)].map((m) => norm(m[1] ?? m[2])).filter((t) => t.length >= 2)
  const shown = area ? hits.filter((h) => h.area === area) : hits
  const colors = projectColors(projects ?? [])
  const names = Object.fromEntries((projects ?? []).map((p) => [p.id, p.name]))
  const counts = Object.fromEntries(AREAS.map((a) => [a, hits.filter((h) => h.area === a).length]))

  return (
    <div className="page">
      <div className="label">00 / Project manager</div>
      <h1 className="display">Cerca</h1>
      <PmTabs />

      <div className="section">
        <input ref={input} className="input pm-search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca in decisioni, note, testi, scene, idee, identità, risultati AI…" />
        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          <select className="select" style={{ width: 'auto' }} value={scope} onChange={(e) => { setScope(e.target.value); setIndex(null) }}>
            <option value="tutti">Tutti i progetti</option>
            {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === activeProject?.id ? ' (attivo)' : ''}</option>)}
          </select>
          <span className="label">Tutte le parole devono esserci · "frase esatta" tra virgolette · accenti ignorati</span>
        </div>
      </div>

      {error && <div className="notice err section">Errore nella ricerca: {error}</div>}
      {!index && !error && <div className="row dim section"><div className="spinner" /> Preparo l'indice…</div>}

      {index && terms.length > 0 && (
        <div className="section">
          <div className="row" style={{ gap: 6 }}>
            <button className={`tag ${area === null ? 'solid' : ''}`} onClick={() => setArea(null)}>Tutto ({hits.length})</button>
            {AREAS.filter((a) => counts[a] > 0).map((a) => (
              <button key={a} className={`tag ${area === a ? 'solid' : ''}`} onClick={() => setArea(area === a ? null : a)}>{AREA_LABEL[a]} ({counts[a]})</button>
            ))}
          </div>
          {shown.length === 0 && <div className="empty" style={{ marginTop: 16 }}>Nessun risultato per “{q}”.</div>}
          {shown.slice(0, 100).map((h, i) => (
            <button key={i} className="pm-hit" onClick={() => open(h.projectId, h.link)}>
              <div className="row" style={{ gap: 6 }}>
                <Dot color={colors[h.projectId]} />
                <span className="label">{names[h.projectId]}</span>
                <span className="tag">{AREA_LABEL[h.area]}</span>
                <span className="label y">{h.where}</span>
              </div>
              <div className="pm-snip"><Highlight text={h.snippet} terms={terms} /></div>
            </button>
          ))}
          {shown.length > 100 && <div className="label" style={{ marginTop: 10 }}>Mostrati i primi 100 di {shown.length}: aggiungi una parola per restringere.</div>}
        </div>
      )}
      {index && terms.length === 0 && (
        <div className="empty section">Scrivi almeno 2 lettere. Indicizzati {index.length} elementi{scope !== 'tutti' ? ` di “${names[scope] ?? ''}”` : ` di ${projects?.length ?? 0} progetti`}.</div>
      )}
    </div>
  )
}
