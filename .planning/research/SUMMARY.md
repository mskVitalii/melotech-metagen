# Project Research Summary

**Project:** Melotech Metagen
**Domain:** AI music content generation and distribution pipeline
**Researched:** 2026-06-02
**Confidence:** HIGH (stack/architecture/pitfalls); MEDIUM (platform-specific feature details)

## Executive Summary

Melotech Metagen is a content transformation pipeline: one LLM call converts a text prompt into a canonical `MusicConcept`, which N deterministic processors transform into platform-specific metadata for Spotify, TikTok, and YouTube. The architecture is well-validated — the canonical intermediary pattern is the single most important design decision, enabling cost control (1 LLM call vs N), consistent identity across platforms, pure-function processors that are trivially testable, and a fallback path that reconstructs failed platform output without a second LLM call. All major stack choices are prescribed and research confirms they are the correct versions and integration patterns.

The recommended build sequence prioritizes infrastructure (Prisma/Redis/config) first, then the core LLM + processor pipeline, then persistence and history, then the frontend. This ordering respects hard dependencies and front-loads the most critical pitfall surface area (LLM integration, structured outputs, rate limiting, Railway deployment config). The generation pipeline is the value-producing core — everything else supports or exposes it.

The primary risks are concentrated in the LLM integration layer: structured output schema mismatches, refusal handling, timeout/retry coordination, and cache stampede under concurrent identical requests. These must be addressed in Phase 1. Secondary risks are Railway-specific deployment gotchas (proxy IP for rate limiting, `prisma generate` at build time, `prisma migrate deploy` at startup) that are easy to miss and hard to debug in production.

---

## Key Findings

### Recommended Stack

All stack choices are prescribed. Research confirmed current stable versions and identified the correct integration patterns for each. The most important version/pattern findings:

- **Prisma 7 + @prisma/adapter-pg**: Use driver adapter pattern (`PrismaPg`), not connection string. No `onModuleInit`/`$connect` needed — Prisma 5+ handles lifecycle automatically.
- **@nestjs/cache-manager 3 + @keyv/redis 5.1.6**: `cache-manager-redis-store` is deprecated. The correct path is `@keyv/redis` as a store adapter. Two-store setup (in-memory L1 + Redis L2) is the recommended pattern.
- **OpenAI SDK 6**: Use `client.chat.completions.parse()` + `zodResponseFormat()` for structured outputs. Never use `response_format: { type: "json_object" }` — it only guarantees syntax, not schema shape.
- **TanStack Query v5**: Object syntax for all hooks (`{ queryKey, queryFn }`). App Router pattern: `prefetchQuery` in Server Components + `HydrationBoundary`.
- **Tailwind CSS v4**: CSS-first config — no `tailwind.config.js` needed.

**Core technologies:**
- NestJS 11 — backend framework; DI/guards/interceptors map cleanly onto LLMProvider/PlatformProcessor abstractions
- Next.js 16 (App Router) — frontend; RSC + TanStack Query HydrationBoundary for SSR prefetch
- Prisma 7 — ORM; type-safe, declarative migrations, generated client
- Redis (Railway) — two purposes: application cache (via @keyv/redis) and rate limit storage (via ioredis + nestjs-throttler-storage-redis); keep clients separate
- OpenAI SDK 6 — structured output generation via `zodResponseFormat`; Zod schema is the source of type truth for MusicConcept

### Expected Features

**Must have (table stakes):**
- Canonical MusicConcept generation (title, genre+subgenre, mood, BPM integer, instruments, description) — everything derives from this
- Spotify processor: title, genre tags, mood tags, BPM, instruments, editorial description (narrative tone, no keyword stuffing)
- TikTok processor: hook (single memorable phrase), 3-5 hashtags (genre + trend + niche mix), caption/post copy
- YouTube processor: SEO title (keyword-first, under 60 chars), keyword-rich description (first 125 chars critical), 8-12 tags
- Character count validation per field per platform — inline, with overflow warnings
- Copy-to-clipboard per field — zero-friction paste into platforms
- Partial failure recovery — `Promise.allSettled` + fallback reconstruction from MusicConcept; `isFallback: true` in response
- Redis caching keyed by `sha256(prompt + sortedPlatforms)` — no re-LLM-call for identical requests
- Rate limiting — 3 req/min per client IP; 429 with Retry-After header
- Request history — paginated, platform-filterable, shows all previous generations

**Should have (differentiators):**
- Platform-specific tone adaptation (TikTok copy that sounds like TikTok, not a press release)
- Genre-informed BPM suggestion with plausibility validation
- YouTube A/B title variants (2-3 options ranked by estimated CTR)
- Spotify editorial pitch template in distributor-expected format
- Exportable metadata package (JSON/CSV for bulk distributor upload)

**Defer (v2+):**
- Trend-aware hashtag generation (requires live data feed)
- Hook virality scoring (requires second LLM pass)
- Platform preview simulation (high visual effort, low v1 value)
- Multi-language output (validate English first)
- Output diff on re-generation (version diffing complexity)

**Anti-features (explicitly do not build):**
- Per-platform LLM calls — cost and consistency killer
- Auto-submit/direct publish to platform APIs — auth complexity, legal liability
- Real-time streaming generation — partial JSON is confusing; show complete output
- Audio file analysis — out of scope entirely

### Architecture Approach

The architecture is a fan-out pipeline: single LLM call produces a `MusicConcept`; a `PlatformRegistry` resolves requested processors; `Promise.allSettled` runs them in parallel; `GenerationService` merges results with partial failure handling; `PersistenceService` writes to two tables (`generation_requests` + `generation_results`); cache is written post-persist. The `PlatformRegistry` uses NestJS multi-provider tokens — new platforms register themselves without modifying existing code. The `LLMProvider` is an abstract class (not an interface) so it survives TypeScript compilation as a DI token.

**Major components:**
1. `GenerationController` — validates request, delegates to service, formats HTTP response
2. `GenerationService` — orchestrates: cache check → LLM call → processor fan-out → persist → cache write
3. `LLMService` + `LLMProvider` (abstract) + `OpenAIProvider` — structured MusicConcept generation via Zod schema
4. `PlatformRegistry` + `PlatformProcessor` (interface) + `SpotifyProcessor`, `TikTokProcessor`, `YouTubeProcessor` — deterministic transforms; pure functions, no I/O
5. `CacheService` — wraps @nestjs/cache-manager; manual key computation inside GenerationService (NOT @UseInterceptors(CacheInterceptor))
6. `PersistenceService` — wraps PrismaService; two-table schema with JSON column for platform outputs
7. `HistoryController` — GET /history with pagination and platform filter via Prisma `include`
8. `ThrottlerGuard` (extended) — Redis-backed, Railway proxy-aware IP extraction

### Critical Pitfalls

1. **`json_object` mode instead of structured outputs** — Use `client.chat.completions.parse()` + `zodResponseFormat(MusicConceptSchema)` always. Required model: `gpt-4o-2024-08-06` or later. The SDK enforces schema server-side; `json_object` only guarantees syntax. Address in Phase 1.

2. **Refusal returns `parsed: null`, crashing on `!` assertion** — After every `.parse()` call, guard `message.refusal` before accessing `message.parsed`. A refusal is a 400, not a 500. Address in Phase 1.

3. **Proxy IP breaks per-user rate limiting on Railway** — Set `app.set('trust proxy', 1)` in NestJS bootstrap and extend `ThrottlerGuard.getTracker()` to use `req.ips[0]`. Without this, all users share one rate limit bucket. Address in Phase 1.

4. **`prisma generate` missing from Railway build + `prisma migrate deploy` missing from start command** — `postinstall` script runs `prisma generate`; start command is `npx prisma migrate deploy && node dist/main.js`. Both are silent failures that only manifest in production. Address in Phase 1.

5. **OpenAI SDK default 10-minute timeout outlasts HTTP layer** — Set explicit `timeout: 30_000` on the OpenAI client; configure NestJS timeout interceptor to 45s on the generation endpoint only. Also set `maxRetries: 0` and implement explicit retry logging — silent SDK retries can push P95 latency to 90+ seconds. Address in Phase 1.

6. **Cache stampede on concurrent identical requests** — Use an in-process `Map<cacheKey, Promise<Result>>` deduplication in `GenerationService`. All concurrent requests for the same key await the same Promise. Sufficient for single-instance Railway deployment. Address in Phase 1.

7. **Promise.all discards partial results** — Use `Promise.allSettled` unconditionally for processor fan-out. This is a project requirement, not a nice-to-have. Address in Phase 1.

---

## Implications for Roadmap

### Phase 1: Core Backend Infrastructure

**Rationale:** All downstream work depends on this. Database schema, Prisma setup, LLM integration, and Railway configuration must be in place before any processor can be built or tested. This phase also front-loads the highest-concentration pitfall surface area.

**Delivers:** Working NestJS app; Prisma schema with migrations; OpenAI structured output producing a valid `MusicConcept`; Redis cache + rate limiter configured correctly; Railway deployment config with correct build/start commands.

**Implements:** `PrismaModule`, `PrismaService`, `LLMModule`, `LLMProvider` abstract class, `OpenAIProvider`, `MusicConcept` Zod schema, `CacheModule` (two-store), `ThrottlerModule` (Redis-backed, proxy-aware), NestJS bootstrap config (CORS, trust proxy, shutdown hooks).

**Avoids:** Pitfalls 1, 2, 3, 4, 5, 6 (all LLM + deployment + infrastructure pitfalls).

### Phase 2: Generation Pipeline + Processors

**Rationale:** Once the LLM produces a valid `MusicConcept` and infrastructure exists, the processor layer can be built as pure transforms — no external dependencies needed for unit testing.

**Delivers:** Complete generation pipeline: `PlatformRegistry` (multi-provider), `SpotifyProcessor`, `TikTokProcessor`, `YouTubeProcessor`, `GenerationService` (fan-out, `Promise.allSettled`, fallback reconstruction), `GenerationController`, `PersistenceService` (two-table write).

**Addresses features:** All three platform processors with correct field shapes; partial failure recovery; request persistence; caching (manual key computation inside service).

**Avoids:** Anti-pattern of `Promise.all`; anti-pattern of per-platform LLM calls; anti-pattern of HTTP-layer caching.

### Phase 3: History + Query Layer

**Rationale:** History endpoint is a read layer over already-persisted data. Depends on Phase 2 having written records. Simple to build once persistence exists.

**Delivers:** `GET /history` with pagination and platform filter; `HistoryController`; `PersistenceService.findHistory()` using `include` (not N+1 loop).

**Addresses features:** History view; platform filter; pagination.

**Avoids:** Pitfall 8 (N+1 query) — use `include: { generationResults: true }` in single `findMany`.

### Phase 4: Frontend

**Rationale:** Frontend is built last, consuming a complete and tested API. All backend contracts are known. TanStack Query patterns (HydrationBoundary, prefetchQuery, mutation invalidation) are straightforward with a stable API.

**Delivers:** Prompt input + platform multi-select + generate button; side-by-side platform output comparison view; per-field copy-to-clipboard; character count validation; history view with pagination and platform filter; TanStack Query integration with server-side prefetch for history.

**Avoids:** Pitfall 12 (mutation retry causing duplicate generations — `retry: false`); Pitfall 13 (`useQuery` refetching on window focus — `staleTime: 60_000`).

### Phase Ordering Rationale

- Infrastructure before pipeline: `GenerationService` depends on `PrismaService`, `CacheService`, `LLMService`, and `PlatformRegistry` all existing. Building them in sequence avoids integration surprises.
- Processors before history: History queries records written by the generation pipeline; no records exist until Phase 2 completes.
- Backend before frontend: Frontend API contracts (response shapes, error codes, pagination parameters) must be stable before building UI. Building frontend against an unstable API causes churn.
- Pitfall clustering: 80% of critical pitfalls are in Phase 1 (infrastructure + LLM). Front-loading them means Phase 2+ builds on a solid, tested base.

### Research Flags

Phases with standard patterns (skip research-phase during planning):
- **Phase 1 (infrastructure):** All patterns are well-documented; STACK.md contains exact code snippets for PrismaService, CacheModule, ThrottlerModule, and OpenAI structured outputs.
- **Phase 3 (history):** Simple Prisma read queries; documented in ARCHITECTURE.md.
- **Phase 4 (frontend):** TanStack Query v5 App Router patterns documented in STACK.md.

Phases that may benefit from deeper research during planning:
- **Phase 2 (processors):** Platform-specific field requirements (Spotify genre taxonomy, TikTok hashtag patterns) were researched with MEDIUM confidence. Verify current platform specs before implementing prompt engineering in processors — platform rules evolve.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All package versions verified via npm registry; official docs consulted for integration patterns |
| Architecture | HIGH | Standard NestJS patterns; multi-provider token, abstract class DI token, Promise.allSettled fan-out — all documented behaviors |
| Pitfalls | HIGH | Sourced from official SDK and framework docs via Context7; specific to the exact version stack being used |
| Features | MEDIUM | Spotify/YouTube field requirements are stable and well-documented; TikTok hashtag/hook patterns evolve quickly and platform docs were inaccessible during research |

**Overall confidence:** HIGH for implementation decisions; MEDIUM for platform-specific content quality constraints (BPM ranges, canonical genre/mood enumerations, TikTok trend patterns).

### Gaps to Address

- **Spotify genre taxonomy enumeration**: Research confirms subgenre matters for algorithmic placement but the exact canonical list was not sourced from a primary document. During Phase 2, source the current Spotify genre list and embed it as a Zod `.enum([...])` in the MusicConcept schema or as a prompt-injected reference list.
- **TikTok hashtag viability**: Made-up hashtags produce zero discovery. During Phase 2 processor implementation, curate a baseline list of genre-specific hashtags from TikTok's current search data rather than relying solely on LLM generation.
- **BPM range heuristics**: Genre-to-BPM ranges used for validation are industry convention, not official specification. Embed validated ranges as a lookup table in the MusicConcept schema (Zod `.min/.max` refined per genre) during Phase 2.
- **OpenAI model version pinning**: Structured outputs require `gpt-4o-2024-08-06` or later. Pin the model string in config (`ConfigService`), not hardcoded in `LLMService`. As newer models release, evaluate whether switching provides quality improvements.

---

## Sources

### Primary (HIGH confidence)
- NestJS official docs (Context7 /nestjs/docs.nestjs.com) — DI patterns, CacheModule, ThrottlerModule, lifecycle hooks, rate limiting
- Prisma official docs (Context7 /websites/prisma_io) — NestJS integration, driver adapter, migrations
- OpenAI Node SDK (Context7 /openai/openai-node) — structured outputs, `zodResponseFormat`, refusal handling, timeout/retry config
- TanStack Query docs (Context7 /tanstack/query) — v5 App Router SSR patterns
- npm registry (2026-06-02) — all package versions verified

### Secondary (MEDIUM confidence)
- Spotify for Artists documentation — field requirements, genre taxonomy, editorial pitching
- YouTube Creator Academy — SEO title/description/tag best practices
- Music distribution platform patterns (DistroKid, TuneCore, CD Baby) — content quality standards
- Industry conventions — BPM ranges by genre

### Tertiary (MEDIUM-LOW confidence)
- TikTok Creator Marketplace guidelines — hashtag patterns, hook virality; evolves quickly, verify before Phase 2 processor implementation

---
*Research completed: 2026-06-02*
*Ready for roadmap: yes*
