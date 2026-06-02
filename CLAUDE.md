<!-- GSD:project-start source:PROJECT.md -->

## Project

**Melotech Metagen**

A content distribution pipeline that accepts a raw AI music concept (text prompt) and generates platform-specific marketing content for multiple music distribution channels simultaneously. The system uses an LLM to first produce a canonical MusicConcept, then transforms it into tailored outputs for each target platform (Spotify, TikTok, YouTube) — designed as an extensible platform supporting dozens of channels without modifying existing code.

**Core Value:** Given a single music prompt, instantly generate all platform-optimized content needed to distribute a track — so artists never have to rewrite the same concept for each platform.

### Constraints

- **Tech Stack**: Next.js App Router, NestJS, Prisma, PostgreSQL, Redis — prescribed, not negotiable
- **LLM Vendor**: OpenAI for v1; all LLM calls go through the `LLMProvider` abstraction
- **Deployment**: Railway (Next.js + NestJS + PostgreSQL + Redis as separate services)
- **Rate Limit**: 3 requests/minute enforced at API level
- **Architecture**: SOLID-oriented platform processor design; no direct vendor SDK calls from processors

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| NestJS | 11.1.24 | Backend API framework | v11 is current stable; uses Express under the hood by default; first-class DI, guards, interceptors, and module system map cleanly onto the LLMProvider/PlatformProcessor abstraction pattern this project needs |
| Next.js | 16.2.7 | Frontend framework | Prescribed. App Router is the current default; supports RSC prefetching with TanStack Query via HydrationBoundary |
| TypeScript | 6.0.3 | Type safety across both apps | Prescribed; NestJS + Prisma + OpenAI SDK all generate first-class TS types |

### Database & ORM

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | 16+ (Railway default) | Primary persistence | Prescribed. generation_requests + generation_results schema fits relational model well |
| Prisma | 7.8.0 | ORM + migrations | Current stable is v7 (confirmed via npm). Type-safe query builder, declarative migrations via `prisma migrate dev`. No custom `enableShutdownHooks` needed since Prisma v5 — use NestJS built-in lifecycle |
| @prisma/adapter-pg | 7.8.0 | PostgreSQL driver adapter | Prisma v6+ recommends driver adapters over direct connection strings for PostgreSQL. Pairs with `pg` package |

### Caching & Rate Limiting

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Redis | 7.x (Railway service) | Request cache + rate limit storage | Prescribed. Two-phase caching strategy requires fast key-value store |
| @nestjs/cache-manager | 3.1.2 | NestJS cache abstraction | Official NestJS module; v3+ migrated to Keyv under the hood — superior to raw ioredis for application-layer caching because it provides a unified get/set/del API |
| cache-manager | 7.2.8 | Core cache library | Powers @nestjs/cache-manager; v6+ uses Keyv for storage adapters |
| @keyv/redis | 5.1.6 | Redis store adapter for cache-manager | Official Keyv Redis adapter; plugs into CacheModule via `stores` array; replaces the old `cache-manager-redis-store` (deprecated) |
| @nestjs/throttler | 6.5.0 | Rate limiting guard | Official NestJS throttle module v6; supports named throttler definitions, Redis storage via community provider, and `@Throttle()` decorator for per-route overrides |
| nestjs-throttler-storage-redis | 0.5.1 | Redis-backed throttle storage | Community package for Redis-backed distributed rate limiting; supports both ioredis and node-redis clients |
| ioredis | 5.11.0 | Redis client (for throttler storage) | Used by nestjs-throttler-storage-redis. Keep ioredis isolated to the throttler module; do NOT use it directly for application caching — use @nestjs/cache-manager + @keyv/redis there to avoid dual Redis client patterns |

### LLM Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| openai | 6.41.0 | OpenAI SDK | v6 is current (verified via npm). Provides `client.chat.completions.parse()` + `zodResponseFormat()` for type-safe structured output generation without manual JSON parsing. LLMProvider interface wraps this, so the SDK never leaks into platform processors |
| zod | 3.25+ | Schema validation + structured output typing | Required by `zodResponseFormat()` helper. Define MusicConcept schema in Zod → SDK enforces OpenAI returns valid structure → TypeScript types are inferred automatically |

### Frontend Libraries

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TanStack Query | 5.100.14 | Server state management | Prescribed. v5 API (object syntax for all hooks). For App Router: use `HydrationBoundary` + `prefetchQuery` in Server Components; `useQuery`/`useMutation` in Client Components |
| Tailwind CSS | 4.3.0 | Styling | Prescribed. v4 uses CSS-first config (no tailwind.config.js needed) |

### Validation & DTOs

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| class-validator | 0.15.1 | DTO validation decorators | Standard NestJS pattern; used with `useGlobalPipes(new ValidationPipe())` in main.ts |
| class-transformer | 0.5.1 | Plain-to-class transformation | Required by ValidationPipe to hydrate DTO classes from raw request bodies |

### Configuration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @nestjs/config | 4.0.4 | Environment variable management | Official NestJS config module; `ConfigModule.forRoot({ isGlobal: true })` avoids re-importing in every module; use `validationSchema` with Joi or class-validator to fail fast on missing env vars at startup |

## Key Patterns

### PrismaService (Prisma 7 + NestJS 11)

### Redis Caching (application-layer request cache)

### Rate Limiting (Redis-backed, distributed)

### OpenAI Structured Output (LLMProvider implementation)

### TanStack Query v5 + Next.js App Router

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Redis client (caching) | @keyv/redis + @nestjs/cache-manager | raw ioredis | ioredis is fine but @nestjs/cache-manager provides DI integration, interceptor-based caching, and TTL management; avoids boilerplate |
| Redis client (throttler) | ioredis via nestjs-throttler-storage-redis | node-redis | nestjs-throttler-storage-redis explicitly supports both; ioredis has better cluster support and is more widely used in NestJS ecosystem |
| ORM | Prisma | TypeORM | TypeORM has inconsistent types with complex relations; Prisma's generated client is more predictable and its migrations are more reliable |
| Validation approach | class-validator + class-transformer | Zod for DTOs | NestJS ValidationPipe is built around class-validator; using Zod for DTOs requires custom pipes. Keep Zod for OpenAI schema definitions only; class-validator for HTTP DTOs |
| Config validation | Joi schema in ConfigModule | class-validator EnvironmentVariables class | Both work; Joi is lighter and purpose-built for env var schemas; class-validator requires extra boilerplate |
| LLM structured output | openai.chat.completions.parse + zodResponseFormat | Manual JSON mode | parse() is strictly safer — SDK validates the returned JSON matches the Zod schema and throws ParseError on failure; JSON mode requires manual parsing and error handling |

## Installation

# Backend (NestJS)

# Dev dependencies (backend)

# Frontend (Next.js)

## What NOT to Use

- **cache-manager-redis-store**: deprecated, replaced by @keyv/redis in cache-manager v6+
- **@nestjs/redis / @liaoliaots/nestjs-redis**: third-party wrappers; the official @keyv/redis path is now recommended by NestJS docs
- **openai `response_format: { type: 'json_object' }`**: requires manual JSON.parse + manual Zod validation; use `.parse()` + `zodResponseFormat` instead
- **PrismaService with custom `enableShutdownHooks(app)` method**: removed in Prisma v5, replaced by `app.enableShutdownHooks()` in main.ts
- **TanStack Query positional API** (`useQuery(['key'], fn)`): removed in v5; use object syntax always
- **`@keyv/redis` alpha/next channel (6.x alpha)**: stick to 5.1.6 stable

## Sources

- NestJS Prisma recipe (official): https://docs.nestjs.com/recipes/prisma — HIGH confidence
- NestJS Caching docs (official): https://docs.nestjs.com/techniques/caching — HIGH confidence
- NestJS Throttler README (official): https://github.com/nestjs/throttler — HIGH confidence
- Prisma NestJS guide (official): https://www.prisma.io/docs/guides/frameworks/nestjs — HIGH confidence
- OpenAI Node SDK structured outputs: https://github.com/openai/openai-node/blob/master/helpers.md — HIGH confidence
- TanStack Query v5 SSR/App Router guide: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr — HIGH confidence
- Package versions verified via npm registry (2026-06-02)

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
