import { useNavigate } from 'react-router-dom'
import { db } from '../../lib/db'
import { useApp } from '../AppState'

/**
 * Apre un elemento di un progetto: se il progetto non è quello attivo lo rende attivo
 * (i laboratori lavorano sul progetto attivo), poi naviga.
 */
export function useOpenIn() {
  const { activeProject, setActiveProjectId, toast } = useApp()
  const nav = useNavigate()
  return async (projectId: string, link: string) => {
    if (activeProject?.id !== projectId && !link.startsWith('/projects/')) {
      setActiveProjectId(projectId)
      const p = await db.projects.get(projectId)
      if (p) toast(`Progetto attivo: ${p.name}`)
    }
    nav(link)
  }
}

export function Dot({ color }: { color: string }) {
  return <span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, background: color, flex: '0 0 auto' }} />
}

export function Steps({ steps }: { steps: { label: string; done: boolean }[] }) {
  const n = steps.filter((s) => s.done).length
  return (
    <div className="pm-steps" title={`${n}/${steps.length}`}>
      {steps.map((s) => <span key={s.label} className={s.done ? 'on' : ''}>{s.done ? '■' : '□'} {s.label}</span>)}
    </div>
  )
}
