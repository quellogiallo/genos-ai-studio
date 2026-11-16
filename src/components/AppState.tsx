import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, setSetting, type Project } from '../lib/db'

interface Toast { id: number; text: string; kind: 'ok' | 'err' }

interface AppState {
  activeProject: Project | undefined
  setActiveProjectId: (id: string | null) => void
  toast: (text: string, kind?: 'ok' | 'err') => void
}

const Ctx = createContext<AppState | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    getSetting<string | null>('activeProjectId', null).then(setActiveId)
  }, [])

  const activeProject = useLiveQuery(
    () => (activeId ? db.projects.get(activeId) : undefined),
    [activeId],
  )

  const setActiveProjectId = useCallback((id: string | null) => {
    setActiveId(id)
    setSetting('activeProjectId', id)
  }, [])

  const toast = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 6000 : 3000)
  }, [])

  return (
    <Ctx.Provider value={{ activeProject, setActiveProjectId, toast }}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : ''}`}>{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp fuori da AppStateProvider')
  return v
}
