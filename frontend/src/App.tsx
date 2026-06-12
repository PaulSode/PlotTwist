import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { WorkspaceLayout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProjectsListPage } from './pages/ProjectsListPage';
import { ChapterEditorPage } from './pages/ChapterEditorPage';
import { CharactersPage } from './pages/CharactersPage';
import { CharacterDetailPage } from './pages/CharacterDetailPage';
import { TimelinePage } from './pages/TimelinePage';
import { LocationsPage } from './pages/LocationsPage';
import { ObjectsPage } from './pages/ObjectsPage';
import { RelationshipsPage } from './pages/RelationshipsPage';
import { InconsistenciesPage } from './pages/InconsistenciesPage';
import { AssistantPage } from './pages/AssistantPage';
import { SearchPage } from './pages/SearchPage';

export function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<ProjectsListPage />} />

          {/* Manuscript editor — own three-pane layout, no shared Outlet */}
          <Route path="/projects/:projectId/manuscript" element={<ChapterEditorPage />} />
          <Route
            path="/projects/:projectId/manuscript/:chapterId"
            element={<ChapterEditorPage />}
          />

          {/* All other project pages share the workspace shell */}
          <Route path="/projects/:projectId" element={<WorkspaceLayout />}>
            <Route index element={<Navigate to="manuscript" replace />} />
            <Route path="characters" element={<CharactersPage />} />
            <Route path="characters/:characterId" element={<CharacterDetailPage />} />
            <Route path="timeline" element={<TimelinePage />} />
            <Route path="locations" element={<LocationsPage />} />
            <Route path="objects" element={<ObjectsPage />} />
            <Route path="relationships" element={<RelationshipsPage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="inconsistencies" element={<InconsistenciesPage />} />
            <Route path="assistant" element={<AssistantPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
