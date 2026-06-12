# PlotTwist — Backend

The narrative-analysis backend for [PlotTwist](../plottwist.html), the writing copilot that *understands* the manuscript.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Node.js 20 + TypeScript** (strict, ESM) | Fast iteration, strong typing for AI payloads |
| HTTP | **Fastify** | Faster than Express, first-class SSE, plugin-friendly |
| Database | **MongoDB + Mongoose** | Schemaless entities (attribute lists per character), nested documents fit the bible |
| Vector store | **MongoDB Atlas Vector Search** | Keeps RAG in the same database, no extra service |
| LLM | **Anthropic** — Sonnet 4.6 for extraction, Opus 4.7 for consistency, Haiku 4.5 for summaries, Sonnet 4.6 for the assistant | Right model for each job |
| Embeddings | **Voyage AI** (`voyage-3-large`) | Recommended partner of Anthropic |
| Validation | **Zod** | Runtime safety on every input |

## Quick start

```bash
cp .env.example .env       # fill in MONGO_URI, ANTHROPIC_API_KEY, VOYAGE_API_KEY
npm install
npm run indexes            # create Atlas vector index (one-time)
npm run dev                # http://localhost:3001
```

Health check: `curl localhost:3001/healthz`

## The architecture in one paragraph

A novel is stored at **three layers**: the raw chapter text (source of truth), a structured *bible* of entities extracted by Claude (characters, locations, events, relationships — each fact tagged with its source chapter), and a vector index of paragraph-level chunks for RAG. When the author saves a chapter, an async job re-extracts that chapter's entities, merges them into the bible, detects contradictions with previously stated facts, and re-indexes the chunks. The structured bible is what feeds the dashboards and the assistant — never the raw text directly, so cost and latency stay flat regardless of manuscript length.

## The pipeline (the interesting part)

`PUT /v1/chapters/:id/content` → save text → `enqueueAnalysis()` debounces 4s →
`analyzeChapter()` runs:

1. **Build bible summary** — compact textual rep of all characters/locations/objects (~2-3k tokens regardless of project size, sorted by importance).
2. **Extract** (Claude Sonnet 4.6 + `tool_use`) — returns structured `ExtractionResult`: which characters appear, what new attributes are stated, what events happen, what relationships evolve.
3. **Merge into bible** — for each entity:
   - Drop existing attributes sourced from *this* chapter (idempotent re-run)
   - Add new attributes
   - For each new attribute, if an attribute with the same `key` but a different `value` already exists from another chapter → **conflict candidate**
4. **Consistency analysis** (Claude Opus 4.7) — for each conflict candidate, ask Claude whether it's a real contradiction, plausible character evolution, ambiguity, or extraction error. Only `shouldFlag: true` verdicts become `Inconsistency` records the author sees in the UI.
5. **Re-chunk + re-embed** — paragraph-based chunks with sliding-window for long paragraphs, batch-embedded by Voyage, replace chunks for this chapter.

This is what `services/bibleService.ts` does. It's idempotent: re-running on the same chapter produces the same bible state, because every fact is anchored to its source chapter.

## Why scene-anchored attributes

Every claim in the bible carries `sourceChapterId` + `sourceQuote`. This enables:

- **Incremental rebuild** — edit ch. 7, drop only ch. 7's claims, re-extract. The rest of the bible stays intact.
- **Citations in the UI** — "Tome I, ch. 2 says: *two drops of azure...*". The author trusts what they can verify.
- **Contradiction detection without LLM-in-the-loop on every save** — a simple Mongo query (`same key, different value, different chapter`) finds candidates; Claude only adjudicates real conflicts.

## API surface

All routes under `/v1`, all require `Authorization: Dev <userId>` in development.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/projects` | List the user's projects |
| `POST` | `/projects` | Create project |
| `GET\|PATCH\|DELETE` | `/projects/:id` | Single project |
| `GET` | `/projects/:projectId/chapters` | Chapter tree (sans content) |
| `POST` | `/chapters` | Create chapter |
| `GET` | `/chapters/:id` | Chapter with content |
| `PUT` | `/chapters/:id/content` | **Hot path** — save text, triggers analysis |
| `PATCH` | `/chapters/:id` | Update metadata |
| `GET` | `/projects/:projectId/characters` | All characters |
| `GET` | `/characters/:id` | Full character sheet |
| `GET` | `/chapters/:chapterId/characters` | Characters in this scene (right panel) |
| `GET` | `/projects/:projectId/locations` | Locations |
| `GET` | `/projects/:projectId/objects` | Story objects |
| `GET` | `/projects/:projectId/timeline` | Events in narrative order |
| `GET` | `/projects/:projectId/relationships` | Relationship graph edges |
| `GET` | `/projects/:projectId/inconsistencies` | All flagged contradictions |
| `GET` | `/chapters/:chapterId/inconsistencies` | Contradictions involving this chapter (powers the alert in the right panel) |
| `PATCH` | `/inconsistencies/:id` | Resolve / ignore |
| `GET` | `/projects/:projectId/search?q=...` | Semantic search via RAG |
| `POST` | `/projects/:projectId/assistant` | Streaming assistant (SSE) |

## What's stubbed and needs real work for prod

- **Auth** — `routes/_auth.ts` accepts `Dev <userId>` as a development bypass. Wire up a real provider (Clerk, Auth0, Supabase Auth).
- **Job queue** — `services/analysisQueue.ts` is in-process. Replace with BullMQ + Redis so jobs survive restarts and scale across workers. The `enqueueAnalysis()` interface doesn't change.
- **Rate limiting** — Anthropic calls cost real money. Add per-user quotas and `@fastify/rate-limit`.
- **Observability** — Pino logs are fine for dev; production wants OpenTelemetry + Anthropic usage metrics (`response.usage`).
- **Garbage collection** — when a chapter is deleted, attributes referencing it are left orphaned. Add a periodic `cleanupOrphanedAttributes` job.

## Project structure

```
src/
├── config.ts            # env + model selection
├── db.ts                # mongoose connect
├── server.ts            # fastify bootstrap
├── models/index.ts      # all mongoose schemas
├── ai/
│   ├── client.ts        # anthropic SDK singleton
│   ├── prompts.ts       # system prompts + tool schemas
│   ├── extraction.ts    # chapter → ExtractionResult
│   ├── consistency.ts   # claim pair → verdict
│   ├── embeddings.ts    # chunking + voyage
│   └── assistant.ts     # SSE-friendly streaming
├── services/
│   ├── bibleService.ts  # the orchestrator (analyzeChapter)
│   ├── analysisQueue.ts # debounced in-process queue
│   └── rag.ts           # atlas vector search
└── routes/
    ├── _auth.ts
    ├── projects.ts
    ├── chapters.ts
    ├── bible.ts
    ├── inconsistencies.ts
    ├── search.ts
    └── assistant.ts

scripts/
└── createIndexes.ts     # one-time Atlas vector index setup
```
