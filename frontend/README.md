# PlotTwist — Frontend

The React app for [PlotTwist](../plottwist-backend/README.md). Talks exclusively to the backend over the documented HTTP + SSE surface.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite 5 + TypeScript** (strict) | Fast dev server, clean ESM, full type safety |
| UI | **React 18** | Standard, mature, no surprises |
| Routing | **React Router 6** | Nested routes match the project structure naturally |
| Server state | **TanStack Query 5** | The whole UI is fetch + cache + invalidate — this is what it's built for |
| Styles | **Plain CSS with variables** | One design system, no framework, full control |

No CSS framework, no state management library beyond React Query. The product is conceptually simple: fetch from the backend, render, save, invalidate.

## Quick start

```bash
cp .env.example .env       # set VITE_API_URL + VITE_DEV_USER_ID
npm install
npm run dev                # http://localhost:5173
```

Make sure the backend is running at `VITE_API_URL` (default `http://localhost:3001`) and that you have a Mongo user document whose `_id` matches `VITE_DEV_USER_ID`. The backend's `Authorization: Dev <userId>` shortcut handles the rest.

## Pages

| Route | Page | Purpose |
|---|---|---|
| `/` | Projects list | Entry point; create or open a project |
| `/projects/:id/manuscript` | Manuscript editor (3-pane) | Write a chapter. Right panel shows live characters, inconsistencies, scene context. Autosaves 1.5s after the last keystroke. |
| `/projects/:id/manuscript/:chapterId` | Same as above, scoped to a specific chapter | |
| `/projects/:id/characters` | Characters list | Grouped by importance |
| `/projects/:id/characters/:id` | Character detail | **The showcase view** — every attribute traced to its source chapter and verbatim quote (the scene-anchored model made visible) |
| `/projects/:id/timeline` | Chronology | Events in narrative order, grouped by chapter, pivotal events highlighted |
| `/projects/:id/locations` | Locations | Card grid with attributes preview |
| `/projects/:id/relationships` | Relationships | Pairs of characters with evolution timeline (warming, cooling, shift) |
| `/projects/:id/inconsistencies` | Coherence | Global view of detected contradictions with AI reasoning, severity, classification |
| `/projects/:id/assistant` | Assistant | Streaming Claude chat with bible + RAG context, scope-to-chapter selector |

## How the editor and the bible stay in sync

1. User types in the editor → local React state
2. 1.5s of inactivity → `PUT /v1/chapters/:id/content` (TanStack Query mutation)
3. Backend stores the new text and enqueues an analysis job (debounced 4s server-side)
4. The page polls `GET /v1/chapters/:id` every 5s
5. When `chapter.lastAnalyzedVersion` catches up to `analysisVersion`, the editor invalidates `qk.charactersInChapter(id)` and `qk.inconsistenciesForChapter(id)`
6. The right panel re-fetches and the new alerts / characters appear

That's the magic moment from the original concept — Camille writes "le regard brun de Liora", a few seconds later, the right panel surfaces the alert that ties this to "deux gouttes d'azur" from book one.

## Design

The visual language stays identical to the original mockup (`plottwist.html`): a single dark theme with charcoal panels, a warm amber accent, IBM Plex Sans for UI, Source Serif 4 for the manuscript and AI-generated prose, IBM Plex Mono for counts and metadata. All tokens are in `src/styles/global.css`. Component-scoped styles use the colocated `<style>` pattern — it's deliberate: the only consumer of `.attr-card` is `CharacterDetailPage`, so the style lives there.

## Project structure

```
src/
├── main.tsx                 # bootstrap: React + QueryClient
├── App.tsx                  # router
├── env.d.ts                 # Vite ambient types
├── styles/global.css        # design tokens + shared classes
├── lib/
│   ├── types.ts             # domain types matching backend
│   ├── api.ts               # typed fetch + SSE client
│   └── queryKeys.ts         # TanStack Query key factory
├── components/
│   ├── icons.tsx            # outline SVGs
│   ├── Layout.tsx           # WorkspaceLayout + Topbar
│   ├── Sidebar.tsx          # project sidebar (used by 6+ pages)
│   ├── EditorPanel.tsx      # right panel of the manuscript editor
│   └── ErrorBoundary.tsx    # graceful failure
└── pages/
    ├── ProjectsListPage.tsx
    ├── ChapterEditorPage.tsx
    ├── CharactersPage.tsx
    ├── CharacterDetailPage.tsx
    ├── TimelinePage.tsx
    ├── LocationsPage.tsx
    ├── RelationshipsPage.tsx
    ├── InconsistenciesPage.tsx
    └── AssistantPage.tsx
```

## What's deliberately deferred

- **Auth UI** — the API client uses the backend's dev-mode shortcut. A real login flow plugs in at one place (`lib/api.ts` → `headers()`).
- **Drag-and-drop chapter reordering** — works with `PATCH /chapters/:id { order }`, not implemented.
- **Persisted assistant threads** — currently in-memory per session. Backend doesn't yet expose a thread store.
- **Mobile responsive** — the editor in particular is designed for desktop writing sessions.
- **Optimistic updates on save** — the editor relies on the server's response. Adding an optimistic local update is a one-line change in the `useMutation` config.
- **Settings panel** — the cog icon in the sidebar is wired up but not implemented.
