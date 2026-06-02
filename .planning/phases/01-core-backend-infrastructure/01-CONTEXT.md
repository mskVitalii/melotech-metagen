# Phase 1: Core Backend Infrastructure - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers a deployable NestJS backend with: working LLM integration (abstract `LLMProvider` implemented by `OpenAIProvider`), Redis-backed caching module and rate limiting, a migrated PostgreSQL schema via Prisma, and a Railway deployment configuration — all infrastructure and cross-cutting concerns resolved before any feature work begins. The frontend is NOT started in this phase.

This phase covers: API-04 (429 rate limit response), PIPE-02 (LLMProvider interface), RATE-01 (3 req/min limit), RATE-02 (Redis-backed, trust proxy).

</domain>

<decisions>
## Implementation Decisions

### Project Structure

- **D-01:** Single monorepo with two top-level directories: `backend/` (NestJS) and `frontend/` (Next.js). Railway treats each directory as a separate service with its own build/start commands and environment variables.
- **D-02:** Each service has its own `package.json`, `.env` file, and `tsconfig.json`. A root `.env.example` documents all required environment variables across services.
- **D-03:** NestJS project bootstrapped with `nest new` CLI into `backend/`. Module structure: `src/llm/`, `src/config/`, `src/cache/`, `src/throttler/`, `src/prisma/`.

### LLM Integration

- **D-04:** `LLMProvider` is an **abstract class** (not a TypeScript interface) — interfaces are erased at runtime and cannot serve as NestJS DI tokens. Abstract class survives compilation and is directly injectable.
- **D-05:** OpenAI SDK method: **`client.chat.completions.parse()`** with **`zodResponseFormat()`** from `openai/helpers/zod`. Never use `response_format: { type: 'json_object' }` — json_object mode only enforces valid JSON syntax, not field types or required fields.
- **D-06:** OpenAI model pinned to **`gpt-4o-2024-08-06`** — this is the minimum model version that supports structured outputs (JSON schema enforcement). Pin the model in env var `OPENAI_MODEL` defaulting to `gpt-4o-2024-08-06`.
- **D-07:** Refusal guard is **mandatory**: check `message.parsed !== null` before using the result. If `message.parsed === null`, the model issued a content policy refusal — return HTTP 400 with `{ error: 'Content policy refusal — revise your prompt' }`, NOT a 500 error.
- **D-08:** OpenAI client config: `timeout: 30_000`, `maxRetries: 2` (automatic retry with exponential backoff on 429/5xx). Set via `OpenAI` constructor options.

### MusicConcept Zod Schema

- **D-09:** The `MusicConcept` Zod schema used in `zodResponseFormat` (and as the TypeScript type throughout the app):
  ```typescript
  const MusicConceptSchema = z.object({
    title: z.string(),
    genre: z.string(),
    mood: z.string(),
    bpm: z.number().int().min(40).max(250),
    instruments: z.array(z.string()),
    description: z.string(),
  });
  type MusicConcept = z.infer<typeof MusicConceptSchema>;
  ```
  BPM range `40–250` is genre-range grounded (covers all tempos from ambient to drum & bass). Genre and mood are strings (not enums) to avoid hallucination from constrained enum sets.

### Prisma Schema

- **D-10:** All table primary keys use **`String @id @default(cuid())`** — preferred over auto-increment for distributed Railway deployments and avoids integer ID enumeration.
- **D-11:** Schema:
  ```prisma
  model GenerationRequest {
    id        String   @id @default(cuid())
    prompt    String
    createdAt DateTime @default(now()) @map("created_at")
    results   GenerationResult[]

    @@map("generation_requests")
  }

  model GenerationResult {
    id        String   @id @default(cuid())
    requestId String   @map("request_id")
    platform  String
    payload   Json     @map("payload_json")
    createdAt DateTime @default(now()) @map("created_at")
    request   GenerationRequest @relation(fields: [requestId], references: [id])

    @@map("generation_results")
  }
  ```
  `payload` uses Prisma's `Json` type (maps to `jsonb` in PostgreSQL).

### Redis — Dual Client Setup

- **D-12:** Two separate Redis clients — do NOT reuse one client for both purposes:
  - **CacheModule**: `@keyv/redis` + `cacheable` + `@nestjs/cache-manager` (KeyvRedis adapter). Used for request-level caching of generation results.
  - **ThrottlerModule**: `ioredis` + `nestjs-throttler-storage-redis`. Used for rate limit counters.
- **D-13:** Both clients use `REDIS_URL` env var from Railway.
- **D-14:** Cache TTL for generation results: **1 hour (3600 seconds)**. Cache key: `sha256(prompt + '|' + sortedPlatforms.join(','))` — computed in `CacheService` or `GenerationService`.

### Rate Limiting Configuration

- **D-15:** ThrottlerModule config: `{ ttl: 60_000, limit: 3 }` (3 requests per 60 seconds).
- **D-16:** **Trust proxy**: call `app.set('trust proxy', 1)` in `main.ts` before `app.listen()`. This makes Express trust the first `X-Forwarded-For` header, which Railway's load balancer sets.
- **D-17:** Override `ThrottlerGuard.getTracker()` to extract `request.ip` (which reflects the real IP after trust proxy). Without this override, the default tracker uses `connection.remoteAddress` which is always Railway's internal load balancer IP.
- **D-18:** 429 response body: `{ statusCode: 429, message: 'Too Many Requests', retryAfter: 60 }`. Include `Retry-After: 60` header.

### Railway Deployment Configuration

- **D-19:** Railway build config for `backend/` service:
  - **Build command**: `npm run build` (runs `tsc` via NestJS CLI)
  - **postinstall script**: `prisma generate` (runs automatically after `npm install`, generates Prisma Client)
  - **Start command**: `npx prisma migrate deploy && node dist/main.js`
  - `prisma migrate deploy` runs pending migrations at startup (not `migrate dev`)
- **D-20:** Environment variables required for backend Railway service:
  ```
  DATABASE_URL=postgresql://...
  REDIS_URL=redis://...
  OPENAI_API_KEY=sk-...
  OPENAI_MODEL=gpt-4o-2024-08-06
  PORT=3001
  NODE_ENV=production
  ```
- **D-21:** Railway `railway.toml` at `backend/railway.toml` with service definitions. Frontend and backend are separate Railway services pointing to the same repo but different root directories.

### Environment & Config Module

- **D-22:** Use `@nestjs/config` + `ConfigModule.forRoot({ isGlobal: true })`. Validate environment variables with a Zod schema in `src/config/env.validation.ts` using `validate` option. Fail fast on boot if required env vars are missing.

### Claude's Discretion

- Exact NestJS module file naming and directory organization within `backend/src/` — follow NestJS convention (`*.module.ts`, `*.service.ts`, `*.controller.ts`).
- Whether to use `nestjs-prisma` library's `PrismaModule.forRoot()` vs a manual `PrismaService` — planner should choose whichever is simpler to set up with NestJS v11.
- CORS configuration for backend — allow all origins in development; set `FRONTEND_URL` env var for production CORS.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Project overview, constraints, key decisions
- `.planning/REQUIREMENTS.md` — Requirements API-04, PIPE-02, RATE-01, RATE-02 (Phase 1 scope)
- `.planning/research/STACK.md` — Verified library versions: NestJS 11.1.24, Prisma 7.8.0, OpenAI v6, @keyv/redis 5.1.6, ioredis 5.11.0
- `.planning/research/ARCHITECTURE.md` — NestJS DI patterns: multi-provider token, abstract class as DI token, Redis dual-client setup
- `.planning/research/PITFALLS.md` — Critical pitfalls: structured outputs vs json_object, refusal guard, trust proxy, Railway deployment scripts, cache stampede

### Research Summary
- `.planning/research/SUMMARY.md` — Synthesized findings; recommended build order confirms Phase 1 = infrastructure first

No external ADRs or specs — all decisions captured above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet — greenfield project.

### Established Patterns
- None yet — this phase establishes the foundational patterns for all subsequent phases.

### Integration Points
- Phase 2 (`GenerationService`, `PlatformRegistry`) will inject `LLMProvider` (abstract class) and `CACHE_MANAGER` established here.
- Phase 2 will use `PrismaService` established here for persistence writes.
- All subsequent phases depend on the `ThrottlerModule` and `CacheModule` configured here.

</code_context>

<specifics>
## Specific Ideas

- The `LLMProvider` abstract class should expose a single method: `generateStructured<T>(prompt: string, schema: ZodSchema<T>): Promise<T>` — this signature lets callers pass the schema inline rather than requiring the provider to know about `MusicConcept` specifically.
- The `MusicConceptSchema` lives in a shared types module (`src/generation/types/music-concept.schema.ts`) so both `LLMService` (which generates it) and `PlatformProcessors` (which consume it) import from one place.
- Railway PostgreSQL add-on connection string uses `?sslmode=require` — Prisma's `datasource` block needs `url = env("DATABASE_URL")` and the URL must include SSL params.

</specifics>

<deferred>
## Deferred Ideas

- Spotify genre taxonomy list — needed for Phase 2 TikTok/Spotify prompt engineering, not Phase 1 infrastructure.
- TikTok baseline hashtag list — same, Phase 2 concern.
- Idempotency key / duplicate request protection — POST /generate dedup strategy is a Phase 2 concern.
- Subgenre field on MusicConcept (v2 enhancement, GEN-01 in REQUIREMENTS.md) — not in v1 scope.

</deferred>

---

*Phase: 1-Core-Backend-Infrastructure*
*Context gathered: 2026-06-02*
