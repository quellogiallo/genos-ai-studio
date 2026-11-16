import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppStateProvider } from './components/AppState'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import SettingsPage from './pages/SettingsPage'
import ModulePage from './pages/ModulePage'
import MusicLabPage from './pages/MusicLabPage'
import TrackPage from './pages/TrackPage'

// HashRouter: necessario su GitHub Pages (nessun server che gestisce le rotte)
export default function App() {
  return (
    <AppStateProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="music" element={<MusicLabPage />} />
            <Route path="music/:trackId" element={<TrackPage />} />
            <Route path="video" element={<ModulePage id="video" />} />
            <Route path="content" element={<ModulePage id="content" />} />
            <Route path="art" element={<ModulePage id="art" />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<div className="page"><div className="notice err">Pagina non trovata.</div></div>} />
          </Route>
        </Routes>
      </HashRouter>
    </AppStateProvider>
  )
}
