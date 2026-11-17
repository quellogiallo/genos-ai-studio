import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppStateProvider } from './components/AppState'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ProjectsPage from './pages/ProjectsPage'
import TimelinePage from './pages/TimelinePage'
import SearchPage from './pages/SearchPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import SettingsPage from './pages/SettingsPage'
import MusicLabPage from './pages/MusicLabPage'
import TrackPage from './pages/TrackPage'
import ComparePage from './pages/ComparePage'
import { AbletonChat, AbletonHome } from './pages/AbletonPage'
import LyricsPage from './pages/LyricsPage'
import ReferencesPage from './pages/ReferencesPage'
import BeatsPage from './pages/BeatsPage'
import VideoLabPage from './pages/VideoLabPage'
import VideoPage from './pages/VideoPage'
import VideoBookPage from './pages/VideoBookPage'
import VideoChecklistPage from './pages/VideoChecklistPage'
import ContentLabPage from './pages/ContentLabPage'
import CampaignPage from './pages/CampaignPage'
import ArtLabPage from './pages/ArtLabPage'
import BrandBookPage from './pages/BrandBookPage'

// HashRouter: necessario su GitHub Pages (nessun server che gestisce le rotte)
export default function App() {
  return (
    <AppStateProvider>
      <HashRouter>
        <Routes>
          {/* libro di produzione: fuori dal layout, per stampare pulito */}
          <Route path="video/:videoId/book" element={<VideoBookPage />} />
          <Route path="art/brandbook" element={<BrandBookPage />} />
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="timeline" element={<TimelinePage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="music" element={<MusicLabPage />} />
            <Route path="music/:trackId" element={<TrackPage />} />
            <Route path="music/:trackId/compare" element={<ComparePage />} />
            <Route path="music/:trackId/lyrics" element={<LyricsPage />} />
            <Route path="music/assistant" element={<AbletonHome />} />
            <Route path="music/references" element={<ReferencesPage />} />
            <Route path="music/beats" element={<BeatsPage />} />
            <Route path="music/assistant/:chatId" element={<AbletonChat />} />
            <Route path="video" element={<VideoLabPage />} />
            <Route path="video/:videoId" element={<VideoPage />} />
            <Route path="video/:videoId/checklist" element={<VideoChecklistPage />} />
            <Route path="content" element={<ContentLabPage />} />
            <Route path="content/:campaignId" element={<CampaignPage />} />
            <Route path="art" element={<ArtLabPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<div className="page"><div className="notice err">Pagina non trovata.</div></div>} />
          </Route>
        </Routes>
      </HashRouter>
    </AppStateProvider>
  )
}
