# Walking Skeleton — Melotech Metagen

**Phase:** 1
**Generated:** 2026-06-02

## Capability Proven End-to-End

An API consumer can call `GET /health` on the deployed NestJS backend and receive `{ status: "ok" }`, served by a process that booted only after Zod-validated configuration passed and whose Prisma-migrated PostgreSQL schema (`generation_requests`, `generation_results`) exists in the database. This exercises the full backend stack: scaffold → config validation → ORM → applied migration → HTTP route → Railway deploy config.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend framework | NestJS 11.1.24 (Express adapter) | Prescribed; DI/guards/modules map cleanly to the LLMProvider + PlatformProcessor abstractions (D-03). Express adapter required for `trust proxy` (D-16). |
| ORM + migrations | Prisma 7.8.0, `provider = "prisma-client"`, `output = "../src/generated/prisma"` | Prisma 7 renamed provider and made `output` mandatory; generated client lives in `src/` so it is included in TS compilation (D-10, D-11; RESEARCH Pattern 2). |
| Prisma integration | Manual `PrismaService extends PrismaClient` (NOT `nestjs-prisma`) | Zero extra dependency; verified Prisma 7 compatible (Claude's Discretion; RESEARCH Open Question 1). |
| Config / env | `@nestjs/config` + Zod `validate()` (fail-fast at boot) | One validation path shared with LLM schemas; no Joi; structured boot-time errors (D-22; RESEARCH Pattern 8). |
| Primary keys | `String @id @default(cuid())` | Avoids integer ID enumeration; safe for distributed Railway deploys (D-10). |
| Deployment target | Railway (separate backend + frontend services, same repo) | Prescribed; `backend/railway.toml`; start command runs `prisma migrate deploy` then boots (D-01, D-19, D-21). |
| Directory layout | `backend/src/{config,prisma,llm,cache,throttler,generation,health}/` | NestJS module-per-concern; matches D-03 module structure. |
| IP trust | `app.set('trust proxy', 1)` before listen | Railway load balancer sets X-Forwarded-For; required for per-IP rate limiting (D-16). |

## Stack Touched in Phase 1

- [x] Project scaffold (NestJS CLI, tsc build, jest test runner) — 01-01
- [x] Routing — real route `GET /health` — 01-01
- [x] Database — real schema migrated via `prisma migrate dev/deploy`; tables created — 01-01 (read/write exercised by Phase 2)
- [x] Config validation — fail-fast Zod env validation at boot — 01-01
- [x] LLM integration — `LLMProvider` abstract + `OpenAIProvider.generateStructured<T>()` real OpenAI structured-output call — 01-02
- [x] Caching — dual-store CacheModule (L1 memory + L2 Redis) — 01-03
- [x] Rate limiting — Redis-backed ThrottlerModule, 3/min/IP, 429 + Retry-After — 01-03
- [x] Deployment — `backend/railway.toml` build + start (migrate deploy) + healthcheck; documented local docker run for PostgreSQL/Redis — 01-01

## Out of Scope (Deferred to Later Slices)

- POST /generate endpoint and the generation pipeline (GenerationService, fan-out, fallback) — Phase 2
- Platform processors (Spotify/TikTok/YouTube), PlatformRegistry — Phase 2
- Cache key computation and read/write of cached generations — Phase 2 (CacheModule is wired in Phase 1, used in Phase 2)
- Persistence writes to the two tables — Phase 2 (schema/migration done in Phase 1)
- GET /history pagination + platform filter — Phase 3
- All frontend (Next.js) — Phase 4
- Idempotency / duplicate-request protection — deferred (Phase 2 concern per CONTEXT)
- Subgenre field, BPM heuristics, observability — v2

## Subsequent Slice Plan

Each later plan/phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **01-02:** LLMProvider abstraction + OpenAIProvider (structured output, refusal guard, timeout) + MusicConcept schema.
- **01-03:** Dual-store Redis CacheModule + Redis-backed ThrottlerModule (3/min/IP, proxy-aware) + custom 429 ThrottlerExceptionFilter.
- **Phase 2:** POST /generate — MusicConcept generation → processor fan-out → fallback → persist → cache.
- **Phase 3:** GET /history — paginated, platform-filterable query.
- **Phase 4:** Next.js App Router frontend.
