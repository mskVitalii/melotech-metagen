# Phase 2: Generation Pipeline - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 delivers the complete POST /generate endpoint: receives `{ prompt, targetPlatforms }`, generates a canonical MusicConcept via LLM, fans out to platform processors in parallel, handles partial failures with fallback reconstruction, persists all results, caches for identical requests, and returns `{ requestId, results }`. All platform processor logic (Spotify, TikTok, YouTube) plus the orchestration layer lives here.

Phase 2 covers: API-01, PIPE-01, PIPE-03-05, PROC-01-05, CACHE-01-03, PERSIST-01-02.

</domain>

<decisions>
## Implementation Decisions

### PlatformProcessor Interface & Registry

- **D-01:** `PlatformProcessor` is a TypeScript `interface` (not abstract class — processors are pure transforms, no shared state) with: `readonly platform: string` and `generate(concept: MusicConcept): Promise<PlatformResult>`.
- **D-02:** `PlatformRegistry` uses NestJS multi-provider injection: each processor registers as `{ provide: PLATFORM_PROCESSOR, useExisting: PlatformXProcessor, multi: true }`. Registry receives `@Inject(PLATFORM_PROCESSOR) processors: PlatformProcessor[]` and builds `Map<string, PlatformProcessor>` in constructor.
- **D-03:** `PLATFORM_PROCESSOR` injection token lives in `backend/src/generation/tokens.ts` as a `Symbol` — NOT a string (avoids accidental collisions). Adding a new platform = register one new provider, zero changes to registry or GenerationService.

### Platform Processors

- **D-04:** `SpotifyProcessor.generate(concept)` returns `{ title, genre, mood, bpm, instruments, description }` — a deterministic transform of MusicConcept fields (no LLM call; processors are pure transforms per SPEC and PIPE-02). SpotifyProcessor may refine/format values but uses the concept as sole input.
- **D-05:** `TikTokProcessor.generate(concept)` returns `{ hook, hashtags: string[] }` with exactly 3 hashtags. The hook is derived from concept description. Hashtags are constructed from genre + mood + 'music' using simple slug logic.
- **D-06:** `YouTubeProcessor.generate(concept)` returns `{ title, description, tags: string[] }`. SEO title = `{concept.title} | {concept.genre} {concept.mood}`. Tags = instruments + genre + mood.
- **D-07:** Each processor has a `static buildFallback(concept: MusicConcept): PlatformResult` method — deterministic reconstruction when the processor throws. The fallback is the same computation as `generate()` but guaranteed not to throw. GenerationService calls this on processor failure.

### Cache Strategy

- **D-08:** Cache key: `crypto.createHash('sha256').update(prompt + '|' + [...targetPlatforms].sort().join(',')).digest('hex')`. Uses Node.js built-in `crypto` module. Sorting ensures `['spotify','tiktok']` and `['tiktok','spotify']` produce the same key.
- **D-09:** Cache check is the FIRST step in GenerationService — before any LLM call. Cache hit returns stored result with `requestId` from the original request.
- **D-10:** Cache write happens AFTER successful persistence (both DB write and processor results). Never cache partial results. TTL inherited from CacheModule (1 hour).

### LLM Prompt Design

- **D-11:** `generateMusicConcept(prompt: string)` in GenerationService calls `this.llmProvider.generateStructured(userPrompt, MusicConceptSchema)` where:
  - `userPrompt` = a single string combining system instruction + user input: `"You are a music metadata expert. Generate a complete MusicConcept for the following music idea. Respond with valid JSON matching the schema exactly.\n\nMusic idea: ${prompt}"`
  - No few-shot examples needed — zodResponseFormat + Structured Output enforces the schema
  - BPM must be realistic for the genre (40-250 range enforced by Zod schema)

### Promise.allSettled Fan-out & Fallback

- **D-12:** GenerationService runs `Promise.allSettled(processors.map(p => p.generate(concept)))`. For each `PromiseRejectedResult`, calls `processor.buildFallback(concept)` and sets `fallback: true` on the result. For `PromiseFulfilledResult`, uses the value directly. Never throws on partial failure.
- **D-13:** Response shape: `{ requestId: string, results: Record<string, PlatformOutput> }` where each `PlatformOutput` is `{ ...platformFields, fallback?: true }`. The `fallback` field is present and `true` only on reconstructed results.

### Persistence

- **D-14:** `PersistenceService` is separate from `GenerationService` — injected dependency. Wraps all DB writes.
- **D-15:** Write strategy: `prisma.$transaction([...])` — write `GenerationRequest` first, then all `GenerationResult` rows in the same transaction. If DB write fails, generation still succeeds (results are in cache), but requestId is not in DB. Log the DB error.
- **D-16:** `GenerationRequest.id` is the `requestId` returned in the API response (cuid from Prisma).
- **D-17:** `GenerationResult.payload` (Json field) stores the platform output object including the `fallback` flag if present.

### Request/Response DTOs

- **D-18:** `GenerateRequestDto`: `prompt: string` (non-empty, max 500 chars), `targetPlatforms: string[]` (non-empty array, each item is `'spotify'|'tiktok'|'youtube'` — validated with `@IsIn(['spotify','tiktok','youtube'])`). Uses class-validator decorators.
- **D-19:** Response is typed with TypeScript interfaces (not class-validator) — NestJS serializes plain objects correctly. Return type: `GenerateResponseDto = { requestId: string; results: Record<string, object> }`.

### GenerationModule Structure

- **D-20:** `GenerationModule` imports: `LLMModule` (provides LLMProvider), `PrismaModule` (global but imported explicitly for clarity), `CacheModule` (global). Providers: `[GenerationService, PersistenceService, PlatformRegistry, SpotifyProcessor, TikTokProcessor, YouTubeProcessor]` with PLATFORM_PROCESSOR multi-providers. Controller: `GenerationController`.
- **D-21:** `GenerationModule` registered in `AppModule` imports.

### Claude's Discretion

- Exact system prompt wording beyond D-11 — planner can refine
- Whether `PlatformResult` is a TypeScript type or Zod schema — type preferred (no runtime validation needed on internal transforms)
- Error logging approach (NestJS Logger vs console)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 Foundation
- `.planning/phases/01-core-backend-infrastructure/01-CONTEXT.md` — locked decisions D-01 through D-22 (ESM, Prisma adapter, cache TTL, etc.)
- `.planning/phases/01-core-backend-infrastructure/01-02-SUMMARY.md` — LLM integration summary (LLMProvider, MusicConceptSchema)
- `.planning/phases/01-core-backend-infrastructure/01-03-SUMMARY.md` — Redis/throttler summary (CACHE_MANAGER injection token)

### Live Codebase
- `backend/src/generation/types/music-concept.schema.ts` — MusicConceptSchema + MusicConcept type (canonical, do not redefine)
- `backend/src/llm/llm-provider.abstract.ts` — LLMProvider abstract class (DI token)
- `backend/src/llm/llm.module.ts` — LLMModule exports LLMProvider
- `backend/src/prisma/prisma.service.ts` — PrismaService (uses @prisma/adapter-pg)
- `backend/src/app.module.ts` — registration point for GenerationModule

### Project Requirements
- `.planning/REQUIREMENTS.md` — Requirements API-01, PIPE-01, PIPE-03-05, PROC-01-05, CACHE-01-03, PERSIST-01-02
- `.planning/phases/02-generation-pipeline/02-CONTEXT.md` — this file

### Critical: ESM imports
- All local imports MUST use `.js` extension (project is `"type": "module"`)
- Example: `import { MusicConcept } from '../types/music-concept.schema.js'`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MusicConceptSchema` + `MusicConcept` type — import from `./types/music-concept.schema.js`
- `LLMProvider` abstract class — inject via `@Inject(LLMProvider)` or constructor injection
- `PrismaService` — inject via `@Inject(PrismaService)` — has `$transaction()` method
- `CACHE_MANAGER` token from `@nestjs/cache-manager` — inject for get/set operations
- `ConfigService` — global, no need to import ConfigModule in GenerationModule

### Established Patterns (from Phase 1)
- NestJS modules: `@Module({ imports, providers, exports, controllers })`
- All local imports use `.js` extension (ESM, `module: nodenext`)
- Injectable services: `@Injectable()` decorator on class
- Abstract class as DI token (LLMProvider pattern — same for PLATFORM_PROCESSOR injection token)

### Integration Points
- `GenerationModule` → imports `LLMModule` (for LLMProvider)
- `GenerationModule` → uses `PrismaService` (global via PrismaModule)
- `GenerationModule` → uses `CACHE_MANAGER` (global via CacheModule)
- `AppModule` → imports `GenerationModule`
- Phase 3 `HistoryController` will use `PersistenceService` (or its own service) — keep DB queries in `PersistenceService` for reuse

</code_context>

<specifics>
## Specific Ideas

- `PlatformResult` type per platform should be exported from `generation/types/` so Phase 4 frontend types can import the same contracts
- The `PLATFORM_PROCESSOR` Symbol token in `tokens.ts` enables future platforms to self-register without touching existing files — this is the core OCP pattern from SPEC
- `GenerationService` should NOT import any platform processor directly — it only imports `PlatformRegistry`

</specifics>

<deferred>
## Deferred Ideas

- Spotify genre taxonomy enumeration (platform-specific prompt optimization) — Phase 2 uses string types, enumeration is v2
- TikTok hashtag validation against live TikTok data — v2 enhancement
- Idempotency key / duplicate request protection — Phase 3+ concern
- Per-platform LLM-powered processors (where processors themselves call LLM) — explicitly out of scope per SPEC (processors are pure transforms)
- Subgenre field on MusicConcept — v2

</deferred>

---

*Phase: 2-Generation-Pipeline*
*Context gathered: 2026-06-02*
