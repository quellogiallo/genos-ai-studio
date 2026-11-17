import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from '../lib/db'
import { useApp } from '../components/AppState'
import { loadArtFonts } from '../lib/art/utils'
import IdentityTab from '../components/art/IdentityTab'
import MoodTab from '../components/art/MoodTab'
import ConceptsTab from '../components/art/ConceptsTab'
import ComposerTab from '../components/art/ComposerTab'

const TABS = [
  { id: 'identita', n: 'A1', label: 'Identità' },
  { id: 'moodboard', n: 'A2', label: 'Moodboard' },
  { id: 'concept', n: 'A3', label: 'Concept artwork' },
  { id: 'compositore', n: 'A4', label: 'Compositore' },
] as const

/** Kit dell'Art Direction Lab del progetto attivo (creato alla prima visita). */
export function useKit(projectId: string | undefined) {
  const kit = useLiveQuery(async () => (projectId ? (await db.artkits.where('projectId').equals(projectId).first()) ?? null : null), [projectId])
  useEffect(() => {
    if (projectId && kit === null) {
      const now = Date.now()
      db.artkits.add({ id: uid(), projectId, proposals: [], discarded: [], mood: [], concepts: [], artworks: [], createdAt: now, updatedAt: now }).catch(() => {})
    }
  }, [projectId, kit])
  return kit
}

export default function ArtLabPage() {
  const { activeProject } = useApp()
  const [params, setParams] = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(null)
  const kit = useKit(activeProject?.id)
  useEffect(() => { loadArtFonts() }, [])

  if (!activeProject) return <div className="page"><div className="label">04 / Art Direction Lab</div><h1 className="display">Art Direction</h1><div className="notice section">Serve un progetto attivo. <Link to="/projects" className="y">Scegline uno →</Link></div></div>
  if (!kit) return <div className="page"><div className="row dim"><div className="spinner" /> Caricamento…</div></div>

  const tab = (TABS.find((t) => t.id === params.get('t')) ?? TABS[0]).id
  const go = (t: string) => setParams({ t })

  return (
    <div className="page">
      <div className="label">04 / Art Direction Lab · progetto {activeProject.name}</div>
      <h1 className="display">Art<br /><span className="y">Direction</span></h1>
      <p className="dim">L'identità visiva e sonora del progetto, la moodboard, i concept e gli artwork finali. L'identità scelta diventa una decisione del progetto: Music, Video e Content Lab la rispettano.</p>
      <nav className="wf-steps section" aria-label="Sezioni">
        {TABS.map((t) => <button key={t.id} type="button" className={`step ${tab === t.id ? 'on' : ''}`} onClick={() => go(t.id)}><span className="mono">{t.n}</span>{t.label}{t.id === 'identita' && kit.identity && <span className="ok">✓</span>}</button>)}
      </nav>
      {tab === 'identita' && <IdentityTab kit={kit} project={activeProject} />}
      {tab === 'moodboard' && <MoodTab kit={kit} project={activeProject} />}
      {tab === 'concept' && <ConceptsTab kit={kit} project={activeProject} openComposer={(id) => { setOpenId(id); go('compositore') }} />}
      {tab === 'compositore' && <ComposerTab kit={kit} openId={openId} setOpenId={setOpenId} />}
    </div>
  )
}
