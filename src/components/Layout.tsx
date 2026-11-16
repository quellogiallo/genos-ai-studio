import { Link, NavLink, Outlet } from 'react-router-dom'
import { useApp } from './AppState'

export const MODULES = [
  { to: '/projects', idx: '00', label: 'Progetti', short: 'Prog', glyph: 'P', ready: true },
  { to: '/music', idx: '01', label: 'Music Lab', short: 'Music', glyph: 'M', ready: true },
  { to: '/video', idx: '02', label: 'Video Lab', short: 'Video', glyph: 'V', ready: false },
  { to: '/content', idx: '03', label: 'Content Lab', short: 'Content', glyph: 'C', ready: false },
  { to: '/art', idx: '04', label: 'Art Direction', short: 'Art', glyph: 'A', ready: false },
] as const

export default function Layout() {
  const { activeProject } = useApp()

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <div className="mark">GENOS<br /><span>AI</span> STUDIO</div>
          <div className="label sub">Creative direction system</div>
        </Link>
        <nav className="nav">
          {MODULES.map((m) => (
            <NavLink key={m.to} to={m.to}>
              <span className="idx">{m.idx}</span>
              {m.label}
              {!m.ready && <span className="soon">SOON</span>}
            </NavLink>
          ))}
          <div className="spacer" />
          <NavLink to="/settings">
            <span className="idx">//</span>Impostazioni
          </NavLink>
        </nav>
        <div className="sidebar-foot label">v0.3 · Music Lab F2</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <Link to="/" className="mobile-brand">GENOS<span>/</span>AI</Link>
          <span className="label">Progetto attivo</span>
          {activeProject ? (
            <Link to={`/projects/${activeProject.id}`} className="tag solid" style={{ textDecoration: 'none' }}>
              {activeProject.name}
            </Link>
          ) : (
            <Link to="/projects" className="tag" style={{ textDecoration: 'none' }}>Nessuno</Link>
          )}
        </header>
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Navigazione">
        {MODULES.map((m) => (
          <NavLink key={m.to} to={m.to}>
            <span className="glyph">{m.glyph}</span>{m.short}
          </NavLink>
        ))}
        <NavLink to="/settings"><span className="glyph">⚙</span>Setup</NavLink>
      </nav>
    </div>
  )
}
