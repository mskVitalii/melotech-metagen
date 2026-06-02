# Roadmap: Melotech Metagen

## Overview

The pipeline is built bottom-up: backend infrastructure and LLM integration first, then the generation pipeline and platform processors, then the history query layer, and finally the frontend. This ordering respects hard dependencies — the frontend cannot be built until API contracts are stable, and history queries cannot be built until the generation pipeline is writing records. Front-loading infrastructure also clusters the highest-risk pitfalls (LLM structured outputs, Railway deployment config, Redis rate limiting) into Phase 1 where they can be resolved before any feature work begins.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Core Backend Infrastructure** - NestJS foundation, Prisma schema, LLM integration, Redis caching and rate limiting, Railway deployment config
- [ ] **Phase 2: Generation Pipeline** - MusicConcept generation, platform processors (Spotify/TikTok/YouTube), GenerationService fan-out, persistence
- [ ] **Phase 3: History & Query Layer** - GET /history endpoint with pagination and platform filter
- [ ] **Phase 4: Frontend** - Next.js App Router UI: prompt form, platform selector, comparison view, history view

## Phase Details

### Phase 1: Core Backend Infrastructure

**Goal**: A deployable NestJS backend exists with working LLM integration, Redis-backed caching and rate limiting, and a migrated PostgreSQL schema — all pitfalls resolved before feature work begins
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: API-04, PIPE-02, RATE-01, RATE-02
**Success Criteria** (what must be TRUE):

  1. A POST /generate request that exceeds 3/minute per IP receives HTTP 429 with a Retry-After header; requests within the limit pass through
  2. The `LLMProvider` abstraction is in place: `OpenAIProvider.generateStructured<T>()` produces a valid `MusicConcept` JSON object conforming to the Zod schema — refusals return 400, not 500
  3. Redis is connected; rate limit counters survive a server restart
  4. Prisma migrations run at deploy time; the `generation_requests` and `generation_results` tables exist in the Railway PostgreSQL instance
  5. The NestJS app boots on Railway with correct `trust proxy` config so `X-Forwarded-For` yields the real client IP

**Plans**: 3 plans
Plans:
**Wave 1**

- [ ] 01-01-PLAN.md — Walking Skeleton: NestJS scaffold, Prisma 7 schema + migration, /health, Railway config (boot, migrate deploy, trust proxy)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-02-PLAN.md — LLMProvider abstraction + OpenAIProvider (structured output, refusal guard, timeout) + MusicConcept schema
- [ ] 01-03-PLAN.md — Dual-store Redis CacheModule + Redis-backed ThrottlerModule (proxy-aware) + custom 429 filter

### Phase 2: Generation Pipeline

**Goal**: A single POST /generate call produces platform-specific content for all requested platforms, persists the results, returns cached results for repeated requests, and degrades gracefully when one processor fails
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: API-01, PIPE-01, PIPE-03, PIPE-04, PIPE-05, PROC-01, PROC-02, PROC-03, PROC-04, PROC-05, CACHE-01, CACHE-02, CACHE-03, PERSIST-01, PERSIST-02
**Success Criteria** (what must be TRUE):

  1. POST /generate with `{ prompt, targetPlatforms: ["spotify","tiktok","youtube"] }` returns `{ requestId, results }` with correctly shaped outputs for each platform
  2. Submitting the same prompt + platforms a second time returns immediately from Redis cache without calling the LLM
  3. When one platform processor throws, the response still includes results for all other platforms; the failed platform's result carries `"fallback": true`
  4. Each generation request is stored in `generation_requests`; each platform result is a separate row in `generation_results`
  5. `PlatformRegistry` resolves processors by name; a new platform can be added by registering one new class — no changes to `GenerationService` or existing processors

**Plans**: TBD

Plans:

- [ ] 02-01: PlatformProcessor interface, PlatformRegistry (multi-provider token), SpotifyProcessor, TikTokProcessor, YouTubeProcessor
- [ ] 02-02: GenerationService (cache check → MusicConcept generation → Promise.allSettled fan-out → fallback reconstruction → persist → cache write) + GenerationController + PersistenceService (two-table write)

### Phase 3: History & Query Layer

**Goal**: Users can retrieve a paginated, filterable history of all previous generation requests and their results via the API
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: API-02, API-03, PERSIST-03
**Success Criteria** (what must be TRUE):

  1. GET /history returns a paginated list of previous generation requests with their platform results in a single query (no N+1)
  2. GET /history?platform=tiktok returns only records that include a TikTok result
  3. Pagination parameters (page, limit) control the result window; response includes total count for client-side paging

**Plans**: TBD

Plans:

- [ ] 03-01: HistoryController + PersistenceService.findHistory() with include, platform filter, and pagination

### Phase 4: Frontend

**Goal**: Users can generate platform content from a browser, view results side-by-side, browse history with filtering, and open any previous generation — all without leaving the Next.js app
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08, DOC-01
**Success Criteria** (what must be TRUE):

  1. User can enter a prompt, select one or more platforms, click Generate, and see a loading state followed by a side-by-side comparison view of platform outputs
  2. User can navigate to the History page, see a paginated list of past generations, and filter it by platform
  3. User can click a history entry and view its full platform output details
  4. CLAUDE.md exists and documents AI tool usage, AI-generated parts, manually reviewed parts, and AI's role in the project

**Plans**: TBD

Plans:

- [ ] 04-01: Next.js App Router setup (TypeScript, Tailwind v4, TanStack Query), prompt form + platform multi-select + generate button + comparison view
- [ ] 04-02: History page (TanStack Query prefetch, pagination, platform filter) + history detail view + CLAUDE.md

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Backend Infrastructure | 0/3 | Not started | - |
| 2. Generation Pipeline | 0/2 | Not started | - |
| 3. History & Query Layer | 0/1 | Not started | - |
| 4. Frontend | 0/2 | Not started | - |
