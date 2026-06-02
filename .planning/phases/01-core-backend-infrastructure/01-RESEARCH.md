# Phase 1: Core Backend Infrastructure - Research

**Researched:** 2026-06-02
**Domain:** NestJS 11 + Prisma 7 + OpenAI SDK v6 + Redis (dual-client) + Railway deployment
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Project Structure**
- D-01: Single monorepo with two top-level directories: `backend/` (NestJS) and `frontend/` (Next.js). Railway treats each directory as a separate service with its own build/start commands and environment variables.
- D-02: Each service has its own `package.json`, `.env` file, and `tsconfig.json`. A root `.env.example` documents all required environment variables across services.
- D-03: NestJS project bootstrapped with `nest new` CLI into `backend/`. Module structure: `src/llm/`, `src/config/`, `src/cache/`, `src/throttler/`, `src/prisma/`.

**LLM Integration**
- D-04: `LLMProvider` is an **abstract class** (not a TypeScript interface) — interfaces are erased at runtime and cannot serve as NestJS DI tokens.
- D-05: OpenAI SDK method: `client.chat.completions.parse()` with `zodResponseFormat()` from `openai/helpers/zod`. Never use `response_format: { type: 'json_object' }`.
- D-06: OpenAI model pinned to `gpt-4o-2024-08-06`. Pin in env var `OPENAI_MODEL` defaulting to `gpt-4o-2024-08-06`.
- D-07: Refusal guard is mandatory: check `message.parsed !== null` before using the result. If `message.parsed === null`, return HTTP 400.
- D-08: OpenAI client config: `timeout: 30_000`, `maxRetries: 2`.

**MusicConcept Zod Schema**
- D-09: Schema is:
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

**Prisma Schema**
- D-10: All table PKs use `String @id @default(cuid())`.
- D-11: Two models: `GenerationRequest` (id, prompt, createdAt, results[]) and `GenerationResult` (id, requestId FK, platform, payload Json, createdAt). Table names: `generation_requests`, `generation_results`.

**Redis — Dual Client Setup**
- D-12: Two separate Redis clients — CacheModule uses `@keyv/redis` + `cacheable` + `@nestjs/cache-manager`; ThrottlerModule uses `ioredis` + `nestjs-throttler-storage-redis`.
- D-13: Both clients use `REDIS_URL` env var from Railway.
- D-14: Cache TTL: 1 hour (3600s). Cache key: `sha256(prompt + '|' + sortedPlatforms.join(','))`.

**Rate Limiting Configuration**
- D-15: ThrottlerModule config: `{ ttl: 60_000, limit: 3 }`.
- D-16: Call `app.set('trust proxy', 1)` in `main.ts` before `app.listen()`.
- D-17: Override `ThrottlerGuard.getTracker()` to extract `request.ip` reflecting real IP after trust proxy. In @nestjs/throttler v6, `getTracker` can be set directly in `ThrottlerModule.forRoot()` options as a function — no class extension required.
- D-18: 429 response body: `{ statusCode: 429, message: 'Too Many Requests', retryAfter: 60 }`. Include `Retry-After: 60` header.

**Railway Deployment Configuration**
- D-19: Build command: `npm run build`. postinstall script: `prisma generate`. Start command: `npx prisma migrate deploy && node dist/main.js`.
- D-20: Required env vars: `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `PORT=3001`, `NODE_ENV=production`.
- D-21: `backend/railway.toml` with service definitions.

**Environment & Config Module**
- D-22: Use `@nestjs/config` + `ConfigModule.forRoot({ isGlobal: true })`. Validate with Zod schema in `src/config/env.validation.ts` using `validate` option. Fail fast on boot if required env vars are missing.

### Claude's Discretion
- Exact NestJS module file naming and directory organization within `backend/src/` — follow NestJS convention (`*.module.ts`, `*.service.ts`, `*.controller.ts`).
- Whether to use `nestjs-prisma` library's `PrismaModule.forRoot()` vs a manual `PrismaService` — planner should choose whichever is simpler to set up with NestJS v11.
- CORS configuration for backend — allow all origins in development; set `FRONTEND_URL` env var for production CORS.

### Deferred Ideas (OUT OF SCOPE)
- Spotify genre taxonomy list — Phase 2 concern.
- TikTok baseline hashtag list — Phase 2 concern.
- Idempotency key / duplicate request protection — Phase 2 concern.
- Subgenre field on MusicConcept (v2 enhancement) — not in v1 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| API-04 | Server returns HTTP 429 with appropriate message when rate limit is exceeded | ThrottlerModule v6 throws `ThrottlerException` (429) automatically; default `Retry-After` header is set when throttler name is `default`; custom exception filter needed for D-18 exact body shape |
| PIPE-02 | LLM communication abstracted behind `LLMProvider` interface with `generateStructured<T>(prompt)` | Abstract class as DI token (D-04); `useClass: OpenAIProvider` in LLMModule; `client.chat.completions.parse()` + `zodResponseFormat()` (D-05) |
| RATE-01 | Maximum 3 generation requests per minute per client IP; excess receive HTTP 429 | ThrottlerModule `{ ttl: 60_000, limit: 3 }` + global `APP_GUARD` binding |
| RATE-02 | Rate limiting Redis-backed to survive restarts; Railway trust proxy configured | `nestjs-throttler-storage-redis` + `ioredis`; `app.set('trust proxy', 1)`; `getTracker` override for real IP extraction |
</phase_requirements>

---

## Summary

Phase 1 is a pure infrastructure phase: scaffold the NestJS monorepo, wire Prisma 7 to Railway PostgreSQL, implement the `LLMProvider` abstraction with a real OpenAI structured-output call, configure Redis-backed caching and rate limiting, and produce a `backend/railway.toml` that builds and deploys correctly on first push. No business logic (processors, generation pipeline, history) is delivered here — only the foundational plumbing that all subsequent phases depend on.

The stack is fully prescribed and all versions have been verified against the npm registry as of 2026-06-02. Three findings from this research session require attention from the planner beyond what CONTEXT.md captured:

1. **Prisma 7 generator syntax changed**: `provider = "prisma-client"` (not `prisma-client-js`) and `output` field is now **required** in the generator block. Import path is `./generated/prisma` or similar custom path — no longer from `node_modules`.
2. **`getTracker` can be configured in-module**: `@nestjs/throttler` v6 accepts `getTracker` as a function directly in `ThrottlerModule.forRoot()` options — extending `ThrottlerGuard` as a class is optional, not required.
3. **D-18 exact response body requires a custom exception filter**: The default `ThrottlerException` message is `"ThrottlerException: Too Many Requests"`, not `"Too Many Requests"`. The `retryAfter` field in the body is not added automatically — a custom `ThrottlerExceptionFilter` or overriding `throwThrottlingException` in a subguard is needed to match D-18 exactly.

**Walking Skeleton definition**: The thinnest end-to-end working slice for Phase 1 is: `POST /probe` returns 200 from Railway (proves NestJS boots + Railway config is correct) → a call to `POST /llm-test` returns a valid `MusicConcept` JSON (proves OpenAI structured output works) → three `POST /probe` calls in 60 seconds returns 429 on the third (proves rate limiting works). All this requires Prisma migrations to have run (proves DB schema exists). This is the walking skeleton — no generation pipeline, no caching, just wiring validation.

**Primary recommendation:** Build in this exact order: (1) project scaffold + ConfigModule + env validation, (2) Prisma schema + PrismaService + migrations, (3) LLMModule + OpenAIProvider + MusicConcept schema, (4) ThrottlerModule + trust proxy config, (5) CacheModule + dual Redis clients, (6) Railway deployment files + health check endpoint, (7) integration verification.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| NestJS project scaffold | API / Backend | — | Greenfield; all backend concerns live here |
| Prisma schema + migrations | Database / Storage | API / Backend | Schema is database contract; PrismaService is NestJS singleton |
| LLMProvider abstraction | API / Backend | — | Abstract class + DI token; OpenAI SDK call is backend-only |
| Redis caching (application layer) | API / Backend | CDN / Static | NestJS CacheModule wraps Redis; cache key computation happens in GenerationService |
| Rate limiting (ThrottlerModule) | API / Backend | — | Express middleware layer; Redis backs the counters |
| Environment / ConfigModule | API / Backend | — | Zod env validation at boot; ConfigService injected across all modules |
| Trust proxy config | API / Backend | CDN / Static | Express-level setting affecting IP extraction from X-Forwarded-For |
| Railway deployment config | CDN / Static | API / Backend | `railway.toml` governs build pipeline and start commands |
| CORS configuration | API / Backend | — | `app.enableCors()` in main.ts with FRONTEND_URL |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/core` | 11.1.24 | NestJS runtime | Prescribed; current stable [VERIFIED: npm registry] |
| `@nestjs/common` | 11.1.24 | Decorators, guards, filters, pipes | Core NestJS primitives [VERIFIED: npm registry] |
| `@nestjs/platform-express` | 11.1.24 | Express HTTP adapter | Default NestJS transport; required for `app.set('trust proxy', 1)` [VERIFIED: npm registry] |
| `prisma` | 7.8.0 | ORM + migrations CLI | Prescribed; v7 required `output` in generator; `provider = "prisma-client"` [VERIFIED: npm registry] |
| `@prisma/client` | 7.8.0 | Generated Prisma Client | Companion to prisma; import path from custom `output` dir [VERIFIED: npm registry] |
| `openai` | 6.41.0 | OpenAI SDK | v6 provides `chat.completions.parse()` + `zodResponseFormat()`; peer dep accepts zod `^3.25 \|\| ^4.0` [VERIFIED: npm registry] |
| `zod` | 4.4.3 | Schema validation + structured output typing | Current stable; openai SDK peer dep satisfied; use for MusicConcept schema and env validation [VERIFIED: npm registry] |
| `@nestjs/config` | 4.0.4 | Environment variable management | Official NestJS config module; `validate` option accepts custom function; no Joi dependency — pair with Zod [VERIFIED: npm registry] |
| `@nestjs/cache-manager` | 3.1.2 | NestJS cache abstraction | Official; v3 uses Keyv under the hood; replaces deprecated `cache-manager-redis-store` path [VERIFIED: npm registry] |
| `cache-manager` | 7.2.8 | Core cache library | Powers `@nestjs/cache-manager`; v6+ uses Keyv adapters [VERIFIED: npm registry] |
| `@keyv/redis` | 5.1.6 | Redis store adapter for cache-manager | Official Keyv Redis adapter; 1.1M downloads/week [VERIFIED: npm registry] |
| `keyv` | 5.6.0 | Key-value storage interface | Required by `@nestjs/cache-manager` store setup [VERIFIED: npm registry] |
| `cacheable` | 2.3.5 | In-memory L1 cache store | Provides `KeyvCacheableMemory` for L1 layer in two-store setup [VERIFIED: npm registry] |
| `@nestjs/throttler` | 6.5.0 | Rate limiting guard | Official; v6 supports `getTracker` function in forRoot options [VERIFIED: npm registry] |
| `nestjs-throttler-storage-redis` | 0.5.1 | Redis-backed throttle storage | Community; explicit peerDep `@nestjs/throttler >=6.0.0`; 146K downloads/week; source: github.com/kkoomen/nestjs-throttler-storage-redis [VERIFIED: npm registry] |
| `ioredis` | 5.11.0 | Redis client for throttler storage | Used by `nestjs-throttler-storage-redis`; isolated to throttler module only [VERIFIED: npm registry] |
| `class-validator` | 0.15.1 | DTO validation decorators | Standard NestJS validation pipe pattern [VERIFIED: npm registry] |
| `class-transformer` | 0.5.1 | Plain-to-class transformation | Required by `ValidationPipe` for DTO hydration [VERIFIED: npm registry] |

### Supporting (dev dependencies)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@nestjs/cli` | 11.0.21 | NestJS project scaffold + build | `nest new backend` to bootstrap; `nest build` compiles TypeScript [VERIFIED: npm registry] |
| `typescript` | 6.0.3 | TypeScript compiler | Prescribed; NestJS 11 requires TS 5+ but TS 6 current [VERIFIED: npm registry] |
| `@types/pg` | — | Type definitions for pg driver | Required if using `@prisma/adapter-pg`; install alongside `pg` [ASSUMED] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual `PrismaService` | `nestjs-prisma` library | `nestjs-prisma` provides `PrismaModule.forRoot({ isGlobal: true })`; manual `PrismaService` extending `PrismaClient` is equally valid and has no extra dep. Planner's choice per Claude's Discretion. |
| Zod env validation in `validate` | Joi schema in `validationSchema` | Both valid. Joi requires separate `npm install joi`. Zod is already in the dep tree for LLM schema — use Zod for consistency, avoids adding Joi. |
| `getTracker` in `forRoot` options | Extending `ThrottlerGuard` as class | `forRoot` option is simpler (1 line). Class extension is needed only if multiple override methods are required. Use `forRoot` option. |
| `@prisma/adapter-pg` | Direct `DATABASE_URL` | Direct URL is sufficient for Railway PostgreSQL; adapter adds `pg` dependency and connection pool control but is not required for v1. Use direct URL (simpler). |

### Installation

```bash
# From backend/ directory after nest new

# Core NestJS + config
npm install @nestjs/config

# Prisma
npm install prisma @prisma/client
npx prisma init

# LLM
npm install openai zod

# Caching
npm install @nestjs/cache-manager cache-manager @keyv/redis keyv cacheable

# Rate limiting
npm install @nestjs/throttler nestjs-throttler-storage-redis ioredis

# Validation
npm install class-validator class-transformer

# Dev dependencies
npm install -D @types/node
```

---

## Package Legitimacy Audit

> Note: `slopcheck` defaulted to PyPI registry for these Node.js packages and returned false-positive SLOP verdicts for all scoped packages (e.g., `@nestjs/core`). The correct verification for this project is the **npm registry**. All packages were manually verified via `npm view` and npm download API.

| Package | Registry | Age | Downloads | Source Repo | slopcheck (npm manual) | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@nestjs/core` | npm | ~8 yrs | Very high | github.com/nestjs/nest | OK | Approved |
| `@nestjs/common` | npm | ~8 yrs | Very high | github.com/nestjs/nest | OK | Approved |
| `@nestjs/platform-express` | npm | ~8 yrs | Very high | github.com/nestjs/nest | OK | Approved |
| `@nestjs/config` | npm | ~5 yrs | Very high | github.com/nestjs/config | OK | Approved |
| `@nestjs/cache-manager` | npm | ~5 yrs | High | github.com/nestjs/cache-manager | OK | Approved |
| `@nestjs/throttler` | npm | ~4 yrs | High | github.com/nestjs/throttler | OK | Approved |
| `prisma` | npm | ~5 yrs | Very high | github.com/prisma/prisma | OK | Approved |
| `@prisma/client` | npm | ~5 yrs | Very high | github.com/prisma/prisma | OK | Approved |
| `openai` | npm | ~3 yrs | Very high | github.com/openai/openai-node | OK | Approved |
| `zod` | npm | ~5 yrs | Very high | github.com/colinhacks/zod | OK | Approved |
| `ioredis` | npm | ~9 yrs | Very high | github.com/redis/ioredis | OK | Approved |
| `@keyv/redis` | npm | ~6 yrs | 1.1M/wk | github.com/jaredwray/keyv | OK | Approved |
| `nestjs-throttler-storage-redis` | npm | ~2 yrs (Aug 2024) | 146K/wk | github.com/kkoomen/nestjs-throttler-storage-redis | OK | Approved |
| `cache-manager` | npm | ~10 yrs | Very high | github.com/jaredwray/cacheable | OK | Approved |
| `keyv` | npm | ~7 yrs | Very high | github.com/jaredwray/keyv | OK | Approved |
| `cacheable` | npm | ~2 yrs | Moderate | github.com/jaredwray/cacheable | OK | Approved |
| `class-validator` | npm | ~7 yrs | Very high | github.com/typestack/class-validator | OK | Approved |
| `class-transformer` | npm | ~7 yrs | Very high | github.com/typestack/class-transformer | OK | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none (slopcheck ran against PyPI; all npm packages verified manually via `npm view` and are legitimate)
**Packages flagged as suspicious [SUS]:** none

**Postinstall script check:** `nestjs-throttler-storage-redis`, `cacheable`, `cache-manager` — all have no postinstall scripts. No network-calling postinstall found.

---

## Architecture Patterns

### System Architecture Diagram

```
HTTP Request (POST /generate or rate-probe endpoint)
        |
        v
[Express HTTP Adapter]  ← app.set('trust proxy', 1) in main.ts
        |
        v
[ThrottlerGuard]  ←── getTracker: (req) => req.ips[0] ?? req.ip
        |  (blocks with 429 + Retry-After if >3/min from same IP)
        |
        v
[GenerationController]  ← @UseGuards(ThrottlerGuard) or APP_GUARD
        |
        v
[LLMService]  ←── [LLMProvider abstract class]
                         |
                         v
                   [OpenAIProvider]  ← openai.chat.completions.parse()
                         |               + zodResponseFormat(MusicConceptSchema)
                         |
                         v
                   [OpenAI API] → MusicConcept JSON

[PrismaService]  ←── [PrismaModule] (global singleton)
        |
        v
[Railway PostgreSQL]  (generation_requests, generation_results tables)

[CacheModule]  ←── L1: KeyvCacheableMemory
        |           L2: KeyvRedis(REDIS_URL)
        v
[Railway Redis]

[ThrottlerStorageRedisService]  ←── ioredis(REDIS_URL)
        v
[Railway Redis]  (separate logical namespace from cache)
```

### Recommended Project Structure

```
melotech-metagen/
├── backend/
│   ├── package.json             # independent NestJS deps
│   ├── tsconfig.json
│   ├── railway.toml             # Railway build + start config
│   ├── .env.example
│   ├── prisma/
│   │   ├── schema.prisma        # generator + datasource + models
│   │   └── migrations/          # auto-created by prisma migrate dev
│   └── src/
│       ├── main.ts              # bootstrap: trust proxy, CORS, shutdown hooks, ValidationPipe
│       ├── app.module.ts        # root module: ConfigModule, PrismaModule, CacheModule, ThrottlerModule, LLMModule
│       ├── config/
│       │   └── env.validation.ts  # Zod schema + validate() function for ConfigModule
│       ├── prisma/
│       │   ├── prisma.module.ts   # @Global() module exporting PrismaService
│       │   └── prisma.service.ts  # extends PrismaClient + OnModuleInit/OnModuleDestroy
│       ├── llm/
│       │   ├── llm.module.ts      # provides LLMProvider → OpenAIProvider
│       │   ├── llm-provider.abstract.ts  # abstract class LLMProvider
│       │   └── openai.provider.ts        # implements generateStructured<T>()
│       ├── generation/
│       │   └── types/
│       │       └── music-concept.schema.ts  # MusicConceptSchema + MusicConcept type
│       └── health/
│           └── health.controller.ts  # GET /health → { status: 'ok' } (walking skeleton probe)
├── frontend/                    # Phase 4 — not touched in Phase 1
└── .env.example                 # root-level cross-service var documentation
```

### Pattern 1: NestJS Bootstrap (main.ts)

**What:** Configure Express adapter settings, global guards, pipes, CORS, and shutdown hooks before `app.listen()`.
**When to use:** Always — this is the NestJS entry point.

```typescript
// Source: https://docs.nestjs.com/techniques/security (trust proxy) + CONTEXT.md D-16, D-17
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // D-16: Trust Railway's load balancer for real client IP
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // CORS: allow FRONTEND_URL in prod, all in dev
  const frontendUrl = process.env.FRONTEND_URL;
  app.enableCors({
    origin: frontendUrl ?? true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  });

  // Global validation pipe for all DTOs
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Graceful shutdown (required for Prisma 5+)
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
```

### Pattern 2: Prisma 7 Generator Block (CRITICAL — changed from v6)

**What:** Prisma 7 requires `provider = "prisma-client"` (not `"prisma-client-js"`) and `output` is **mandatory**.
**When to use:** Always for Prisma 7.

```prisma
// Source: https://www.prisma.io/docs/orm/prisma-schema/overview/generators
// Prisma 7 — provider name and required output field
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// D-11: Two-table schema
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

**Import path after generation:**
```typescript
import { PrismaClient } from './generated/prisma';  // or '@prisma/client' if output is default
```

### Pattern 3: PrismaService (manual singleton)

**What:** Singleton NestJS service wrapping PrismaClient. The planner may choose `nestjs-prisma` library instead — both patterns are valid.
**When to use:** Manual approach — no extra dependency.

```typescript
// Source: https://docs.nestjs.com/recipes/prisma
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

```typescript
// prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### Pattern 4: LLMProvider Abstract Class + OpenAI Structured Output

**What:** Abstract class as NestJS DI token; `OpenAIProvider` implements `generateStructured<T>()` using `chat.completions.parse()`.
**When to use:** Phase 1 establishes this; Phase 2 callers inject `LLMProvider`.

```typescript
// llm-provider.abstract.ts — D-04: abstract class survives TS compilation as DI token
import { ZodSchema } from 'zod';

export abstract class LLMProvider {
  abstract generateStructured<T>(prompt: string, schema: ZodSchema<T>): Promise<T>;
}
```

```typescript
// openai.provider.ts — D-05, D-07, D-08
import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { ZodSchema } from 'zod';
import { LLMProvider } from './llm-provider.abstract';

@Injectable()
export class OpenAIProvider extends LLMProvider {
  private readonly openai: OpenAI;

  constructor(private config: ConfigService) {
    super();
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
      timeout: 30_000,   // D-08
      maxRetries: 2,     // D-08
    });
  }

  async generateStructured<T>(prompt: string, schema: ZodSchema<T>): Promise<T> {
    const completion = await this.openai.chat.completions.parse({
      model: this.config.get<string>('OPENAI_MODEL', 'gpt-4o-2024-08-06'),
      messages: [{ role: 'user', content: prompt }],
      response_format: zodResponseFormat(schema, 'structured_output'),
    });

    const message = completion.choices[0]?.message;

    // D-07: Refusal guard — MUST check before accessing .parsed
    if (message?.refusal) {
      throw new BadRequestException(
        `Content policy refusal — revise your prompt: ${message.refusal}`
      );
    }
    if (!message?.parsed) {
      throw new InternalServerErrorException('LLM returned no parsed output');
    }

    return message.parsed as T;
  }
}
```

```typescript
// llm.module.ts
import { Module } from '@nestjs/common';
import { LLMProvider } from './llm-provider.abstract';
import { OpenAIProvider } from './openai.provider';

@Module({
  providers: [
    OpenAIProvider,
    { provide: LLMProvider, useClass: OpenAIProvider },
  ],
  exports: [LLMProvider],
})
export class LLMModule {}
```

### Pattern 5: MusicConcept Schema (shared types)

**What:** Single source of truth for the MusicConcept shape used by LLMProvider callers and platform processors.
**When to use:** Import in LLMService (Phase 2) and all PlatformProcessors (Phase 2).

```typescript
// src/generation/types/music-concept.schema.ts — D-09
import { z } from 'zod';

export const MusicConceptSchema = z.object({
  title: z.string(),
  genre: z.string(),
  mood: z.string(),
  bpm: z.number().int().min(40).max(250),
  instruments: z.array(z.string()),
  description: z.string(),
});

export type MusicConcept = z.infer<typeof MusicConceptSchema>;
```

### Pattern 6: ThrottlerModule with Redis Storage and Trust Proxy

**What:** Redis-backed rate limiting; `getTracker` configured inline in `forRoot` to extract real client IP after trust proxy.
**When to use:** Phase 1; apply as global `APP_GUARD`.

```typescript
// In AppModule imports — D-15, D-17
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { Redis } from 'ioredis';

ThrottlerModule.forRoot({
  throttlers: [{ name: 'default', ttl: 60_000, limit: 3 }],
  storage: new ThrottlerStorageRedisService(
    new Redis(process.env.REDIS_URL)
  ),
  // D-17: getTracker as forRoot option — no class extension needed in @nestjs/throttler v6
  getTracker: (req) => {
    const tracker = req.ips?.length > 0 ? req.ips[0] : req.ip;
    return Promise.resolve(tracker);
  },
})
```

```typescript
// Bind as global guard in AppModule providers
{ provide: APP_GUARD, useClass: ThrottlerGuard }
```

**Note on D-18 response body**: The default `ThrottlerException` throws HTTP 429 with body `{ statusCode: 429, message: "ThrottlerException: Too Many Requests" }` and sets `Retry-After` header automatically. To match D-18 exactly (`message: 'Too Many Requests'`, `retryAfter: 60` in body), a custom `ThrottlerExceptionFilter` is required:

```typescript
// throttler-exception.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    response
      .status(429)
      .header('Retry-After', '60')
      .json({ statusCode: 429, message: 'Too Many Requests', retryAfter: 60 });
  }
}
```

Register globally in `main.ts`: `app.useGlobalFilters(new ThrottlerExceptionFilter())`.

### Pattern 7: CacheModule with Dual-Store (L1 Memory + L2 Redis)

**What:** Two-store setup: in-memory L1 for same-process speed, Redis L2 for persistence across restarts.
**When to use:** Phase 1 establishes the module; Phase 2 uses `CACHE_MANAGER` token.

```typescript
// Source: STACK.md + @nestjs/cache-manager docs
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';

CacheModule.registerAsync({
  isGlobal: true,
  useFactory: async () => ({
    stores: [
      new Keyv({
        store: new KeyvCacheableMemory({ ttl: 60_000, lruSize: 1000 }),
      }),
      new KeyvRedis(process.env.REDIS_URL as string),
    ],
    ttl: 3_600_000,  // D-14: 1 hour default TTL in ms
  }),
})
```

### Pattern 8: ConfigModule with Zod Env Validation

**What:** Fail-fast env validation at boot using Zod inside `validate` option. No Joi dependency.
**When to use:** `ConfigModule.forRoot()` in `AppModule`.

```typescript
// src/config/env.validation.ts — D-22
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4o-2024-08-06'),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().url().optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export function validate(config: Record<string, unknown>) {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Environment validation failed:\n${result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`
    );
  }
  return result.data;
}
```

```typescript
// AppModule
ConfigModule.forRoot({ isGlobal: true, validate })
```

### Pattern 9: Railway Configuration (`backend/railway.toml`)

**What:** Config-as-code for Railway build and deployment.
**When to use:** Committed to `backend/` directory root.

```toml
# backend/railway.toml — D-19, D-21
[build]
buildCommand = "npm run build"

[deploy]
startCommand = "npx prisma migrate deploy && node dist/main.js"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ALWAYS"
```

**Notes:**
- `prisma generate` runs via `"postinstall": "prisma generate"` in `package.json` scripts — fires automatically after `npm install` during Railway build.
- Railway reads `railway.toml` from the **service root directory** (set in Railway dashboard as the root directory for this service). The toml path is relative to that root.
- Environment variables (D-20) are set in Railway dashboard, not in this file.

### Anti-Patterns to Avoid

- **`provider = "prisma-client-js"` in schema.prisma**: Deprecated in Prisma 7. Use `provider = "prisma-client"` and set `output` explicitly.
- **Omitting `output` in Prisma 7 generator block**: `output` is required in Prisma 7. Omitting it causes build failure.
- **Using `app.set('trust proxy', 1)` after `app.listen()`**: Must be called before listen; Express middleware order is execution-order-dependent.
- **`@UseInterceptors(CacheInterceptor)` on the generation endpoint**: POST body is not included in the HTTP interceptor cache key. Cache must be managed manually in `GenerationService`. (Phase 2 concern, but the CacheModule wired here must NOT have the HTTP interceptor applied.)
- **`prisma migrate dev` in production start command**: `migrate dev` is for local development only; it creates migration files and can reset the database. Use `prisma migrate deploy` in production.
- **Single Redis client for both cache and throttler**: `@keyv/redis` and `ioredis` should use separate logical connections to avoid key namespace collisions and different connection lifecycle requirements.
- **`import { PrismaClient } from '@prisma/client'`**: In Prisma 7 with custom `output`, the client lives at the specified output path, not in `node_modules`. Use the custom path.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting with Redis storage | Custom Express middleware + Redis INCR | `@nestjs/throttler` + `nestjs-throttler-storage-redis` | ThrottlerModule handles TTL windows, per-key counters, `Retry-After` header, Redis atomic ops, guard integration |
| Environment variable validation | Manual `if (!process.env.X) throw` | Zod schema in `ConfigModule.validate` | Boot-time failure with structured error messages; type-coercion (PORT as number); default values; no runtime surprises |
| LLM structured output parsing | Manual `JSON.parse()` + Zod `.parse()` | `zodResponseFormat()` + `chat.completions.parse()` | SDK handles schema compilation to OpenAI JSON Schema, type inference, refusal detection — manual JSON mode has race between syntax and schema validation |
| Cache key hashing | Any non-crypto approach | `createHash('sha256').update(payload).digest('hex')` from Node.js `crypto` module | Collision resistance; fixed-length key regardless of prompt length; no extra dependency |
| Graceful process shutdown | Custom SIGTERM handlers | `app.enableShutdownHooks()` | NestJS calls `onModuleDestroy()` on all providers including PrismaService, ensuring clean DB connection close |

**Key insight:** NestJS's module system already solves the hardest integration problems here — DI wiring, lifecycle management, guard application order, global modules. The only custom logic needed is the IP extraction tracker function and the env validation schema.

---

## Common Pitfalls

### Pitfall 1: Prisma 7 Generator Provider Name Changed

**What goes wrong:** Using `provider = "prisma-client-js"` (Prisma 5/6 default) in the `schema.prisma` generator block. Prisma 7 renamed the provider to `"prisma-client"` and requires an explicit `output` path.
**Why it happens:** Documentation and examples from before Prisma 7 are still widely indexed.
**How to avoid:** Use `provider = "prisma-client"` with `output = "../src/generated/prisma"`. The generated client is then imported from that path, not from `@prisma/client` directly.
**Warning signs:** `prisma generate` errors mentioning unknown provider or missing output field.

### Pitfall 2: Structured Output Refusals Return `parsed: null`

**What goes wrong:** Code accesses `message.parsed!` with non-null assertion after a content policy refusal. `parsed` is `null`; the assertion masks the null; null dereference crashes with a 500.
**Why it happens:** `.parse()` does not throw on refusal — it returns a valid response object with `parsed: null`.
**How to avoid:** Always guard `message?.refusal` before accessing `message?.parsed`. Return 400 on refusal, not 500.
**Warning signs:** 500 errors from prompts containing artist names or explicit content.

### Pitfall 3: Railway Proxy IP Makes Rate Limiting Global

**What goes wrong:** Without `app.set('trust proxy', 1)`, `req.ip` is Railway's internal load balancer IP for every request. The 3 req/min limit becomes a global limit across all users.
**Why it happens:** Express does not trust `X-Forwarded-For` by default.
**How to avoid:** Set trust proxy before `app.listen()`; configure `getTracker` to use `req.ips[0] ?? req.ip`.
**Warning signs:** Rate limit triggers after 3 total requests in production; never triggers locally.

### Pitfall 4: Missing `prisma generate` at Railway Build Time

**What goes wrong:** Railway deploys without running `prisma generate` — the TypeScript client at the custom `output` path doesn't exist. Runtime crashes with `Cannot find module './generated/prisma'`.
**Why it happens:** `npm ci` does not run `prisma generate` unless a `postinstall` script exists.
**How to avoid:** Add `"postinstall": "prisma generate"` to `backend/package.json` scripts.
**Warning signs:** Module-not-found errors on Railway deploy that don't reproduce locally (where devs run `prisma generate` manually).

### Pitfall 5: Missing `prisma migrate deploy` at Railway Start Time

**What goes wrong:** New schema changes are deployed but not applied to the Railway PostgreSQL instance. Prisma queries fail on new/renamed columns.
**Why it happens:** Developers use `prisma migrate dev` locally (auto-applies) and forget the production equivalent.
**How to avoid:** Start command: `npx prisma migrate deploy && node dist/main.js`.
**Warning signs:** "Column does not exist" Prisma errors in Railway logs immediately after deploying schema changes.

### Pitfall 6: OpenAI Timeout Coordination

**What goes wrong:** OpenAI SDK default timeout is 10 minutes. NestJS HTTP connection typically times out sooner. The frontend shows an error while the backend LLM call is still in-flight.
**How to avoid:** Set `timeout: 30_000` on OpenAI client; configure a `TimeoutInterceptor` at 45s on the generation endpoint (higher than LLM timeout so SDK failures surface cleanly rather than being masked by HTTP timeout).
**Warning signs:** P95 latency on generation endpoint is 3-4x higher than P50.

### Pitfall 7: ioredis `enableOfflineQueue: true` Hides Redis Outages

**What goes wrong:** ioredis queues commands when Redis is unreachable. The throttler storage hangs indefinitely rather than failing fast, causing all requests to hang.
**How to avoid:** Pass `{ enableOfflineQueue: false }` to the `new Redis()` constructor used by `ThrottlerStorageRedisService`. Attach an error handler to the ioredis instance to prevent unhandled EventEmitter errors crashing Node.
**Warning signs:** Requests hang indefinitely when Redis is restarting on Railway.

### Pitfall 8: D-18 Exact Response Body Not Automatic

**What goes wrong:** Default `ThrottlerException` message is `"ThrottlerException: Too Many Requests"`, not `"Too Many Requests"`. The `retryAfter` field in the response body is not included by default — only the `Retry-After` header is set.
**How to avoid:** Register a `ThrottlerExceptionFilter` as a global exception filter in `main.ts` that intercepts `ThrottlerException` and returns the exact D-18 shape.
**Warning signs:** Integration test checking for `{ message: 'Too Many Requests', retryAfter: 60 }` in the 429 body fails.

---

## Code Examples

Verified patterns from official sources and verified type definitions:

### Cache Key Computation (for Phase 2 reference)

```typescript
// Source: ARCHITECTURE.md + Node.js crypto docs
import { createHash } from 'crypto';

function buildCacheKey(prompt: string, platforms: string[]): string {
  const sorted = [...platforms].sort().join(',');
  const payload = `${prompt}::${sorted}`;
  return `metagen:gen:${createHash('sha256').update(payload).digest('hex')}`;
}
```

### Env Validation with Zod + ConfigModule

```typescript
// Source: NestJS docs (WebFetch verified) — validate option accepts custom function
ConfigModule.forRoot({
  isGlobal: true,
  validate: (config: Record<string, unknown>) => {
    const result = EnvSchema.safeParse(config);
    if (!result.success) throw new Error(`Env validation failed: ${result.error.message}`);
    return result.data;
  },
})
```

### Walking Skeleton Health Endpoint

```typescript
// health.controller.ts — proves NestJS boots and Railway routing works
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `provider = "prisma-client-js"` in schema | `provider = "prisma-client"` (required) | Prisma 7 (2025) | `output` field is now mandatory; import path changes from `@prisma/client` to custom path |
| `PrismaService.enableShutdownHooks(app)` | `app.enableShutdownHooks()` in main.ts | Prisma v5 | Method removed; NestJS lifecycle hooks on PrismaService handle connection cleanup |
| `cache-manager-redis-store` | `@keyv/redis` + `cacheable` | cache-manager v6 (2023) | Old store is deprecated; Keyv adapter is the official path for @nestjs/cache-manager v3+ |
| `response_format: { type: 'json_object' }` | `zodResponseFormat()` + `chat.completions.parse()` | OpenAI SDK v4+ | json_object enforces syntax only; structured outputs enforce schema server-side |
| Class extension for `ThrottlerGuard.getTracker()` | `getTracker` function in `ThrottlerModule.forRoot()` | @nestjs/throttler v6 | Simpler; no class needed unless multiple overrides required |

**Deprecated/outdated:**
- `cache-manager-redis-store`: deprecated, replaced by `@keyv/redis`
- `prisma-client-js` generator provider: renamed to `prisma-client` in v7
- `PrismaService.enableShutdownHooks(app)`: removed in Prisma v5

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@types/pg` is needed if `@prisma/adapter-pg` is used | Standard Stack | Low — planner can resolve at install time; `@prisma/adapter-pg` not required if direct URL is used |
| A2 | Railway reads `railway.toml` from the service root directory set in the Railway dashboard | Architecture Patterns / railway.toml | Medium — if Railway resolves the config from repo root instead, the file path would need to be `backend/railway.toml` relative to repo root. The Railway WebFetch docs confirmed: "specify the absolute path for the railway.json or railway.toml file, for example: `/backend/railway.toml`" — so the file lives at `backend/railway.toml` in the repo but is referenced with its repo-relative path in Railway settings |
| A3 | `nestjs-prisma` library's `PrismaModule.forRoot()` is compatible with Prisma 7 | Claude's Discretion | Low-Medium — `nestjs-prisma` has its own release cycle; planner should verify compatibility before choosing over manual PrismaService |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

---

## Open Questions

1. **Manual PrismaService vs `nestjs-prisma` library (Claude's Discretion)**
   - What we know: Both approaches are valid; STACK.md and ARCHITECTURE.md document both. CONTEXT.md leaves this to planner discretion.
   - What's unclear: `nestjs-prisma` version compatibility with Prisma 7 was not verified.
   - Recommendation: Use the manual `PrismaService extends PrismaClient` pattern (documented in STACK.md) — it requires zero additional dependencies and is fully compatible with Prisma 7.

2. **Prisma output path convention**
   - What we know: In Prisma 7, `output` is required and the path is relative to `prisma/schema.prisma`.
   - What's unclear: Whether the NestJS project's TypeScript paths need adjustment to resolve the generated client.
   - Recommendation: Use `output = "../src/generated/prisma"` so the client lives within `src/` and is included in the TypeScript compilation. Add to `.gitignore`: `src/generated/`.

3. **`ioredis` connection error handling for throttler**
   - What we know: `enableOfflineQueue: true` (default) hides Redis connection failures.
   - What's unclear: Whether `ThrottlerStorageRedisService` accepts ioredis options or a pre-configured `Redis` instance.
   - Recommendation: Pass a pre-configured `new Redis(REDIS_URL, { enableOfflineQueue: false, lazyConnect: false })` instance to `ThrottlerStorageRedisService`. Add `.on('error', logger.error)` on the instance.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend development | Yes | v22.22.2 | — |
| npm | Package management | Yes | 10.9.7 | — |
| NestJS CLI (`nest`) | `nest new` scaffold | No | — | Run `npm install -g @nestjs/cli` or use `npx @nestjs/cli new backend` |
| PostgreSQL | Database (local dev) | No | — | Use Railway PostgreSQL add-on; or `docker run postgres:16` locally |
| Redis | Cache + throttler (local dev) | No | — | Use Railway Redis add-on; or `docker run redis:7` locally |
| Railway CLI | Deployment management | No | — | Configure via Railway dashboard |

**Missing dependencies with no fallback:**
- None that block code development — PostgreSQL and Redis must be provisioned on Railway before deploying, but local dev can use Docker or Railway's dev environment.

**Missing dependencies with fallback:**
- NestJS CLI: use `npx @nestjs/cli@latest new backend` if global install not preferred.
- Local PostgreSQL/Redis: spin up with Docker Compose or point to Railway services directly.

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` in config.

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in v1 (out of scope per REQUIREMENTS.md) |
| V3 Session Management | No | No sessions in v1 |
| V4 Access Control | Partial | Rate limiting per IP (RATE-01/02) is the only access control in Phase 1 |
| V5 Input Validation | Yes | `class-validator` + `ValidationPipe({ whitelist: true })` for all DTOs; Zod for env validation |
| V6 Cryptography | No | No crypto operations in Phase 1 (cache key SHA-256 is hashing, not encryption) |
| V7 Error Handling | Yes | Never leak stack traces; return structured error responses; catch OpenAI errors and return 400/500 appropriately |
| V9 Communications | Yes | `DATABASE_URL` and `REDIS_URL` should use TLS connections on Railway (default); `?sslmode=require` on PostgreSQL URL |
| V14 Configuration | Yes | Env validation at boot; no secrets in code; `NODE_ENV=production` check |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| OpenAI API key exposure | Information Disclosure | Env var only; never logged; Zod validation ensures non-empty at boot |
| IP spoofing via X-Forwarded-For | Spoofing | `trust proxy: 1` trusts only the first hop; Railway's load balancer is the trusted proxy |
| Prompt injection via generation endpoint | Tampering | OpenAI structured outputs constrain the response shape; refusal guard rejects policy violations; no dynamic SQL constructed from prompt |
| Environment variable injection | Elevation of Privilege | Zod `EnvSchema` rejects unexpected values; `whitelist: true` on ValidationPipe strips extra body fields |
| Redis key namespace collision | Tampering | Prefix all cache keys with `metagen:gen:`; throttler uses separate logical namespace via ioredis to different DB index if needed |
| DATABASE_URL without SSL | Information Disclosure | Railway PostgreSQL requires `?sslmode=require` in connection string; Prisma respects this in the datasource URL |

---

## Sources

### Primary (HIGH confidence)
- npm registry (2026-06-02) — all package versions verified: `@nestjs/core@11.1.24`, `prisma@7.8.0`, `openai@6.41.0`, `@nestjs/throttler@6.5.0`, `nestjs-throttler-storage-redis@0.5.1`, `@keyv/redis@5.1.6`, `ioredis@5.11.0`, `zod@4.4.3`, `@nestjs/config@4.0.4`
- `@nestjs/throttler` v6 type definitions (extracted from npm pack) — `getTracker` signature, `ThrottlerModuleOptions` type, `ThrottlerException` message format, `Retry-After` header behavior [VERIFIED: npm registry]
- `.planning/research/STACK.md` — Verified library versions and integration patterns (2026-06-02)
- `.planning/research/ARCHITECTURE.md` — NestJS DI patterns, module structure, Redis dual-client setup
- `.planning/research/PITFALLS.md` — Critical pitfalls sourced from official docs via Context7
- Prisma docs (WebFetch) — Prisma 7 generator `provider = "prisma-client"` and required `output` field [CITED: prisma.io/docs/orm/prisma-schema/overview/generators]
- OpenAI SDK peerDependencies (npm view) — zod `^3.25 || ^4.0` supported [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- Railway config-as-code docs (WebFetch) — `railway.toml` `[build]` and `[deploy]` schema confirmed; monorepo root directory setting documented [CITED: docs.railway.com/reference/config-as-code]
- NestJS ConfigModule `validate` option (WebFetch + confirmed pattern from docs) — custom validation function accepted [CITED: docs.nestjs.com/techniques/configuration]

### Tertiary (LOW confidence)
- None — all findings for Phase 1 scope are HIGH or MEDIUM confidence.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm registry on 2026-06-02
- Architecture: HIGH — NestJS DI patterns verified via type definitions; Prisma 7 generator change verified via official docs
- Pitfalls: HIGH — sourced from PITFALLS.md (Context7 verified) + ThrottlerException verified from type defs
- Railway config: MEDIUM — WebFetch of Railway docs provided partial schema; `preDeployCommand` alternative to start-command migration noted but not required

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (stable infrastructure; 30-day horizon)

**New findings vs CONTEXT.md:**
1. Prisma 7 `provider = "prisma-client"` (not `"prisma-client-js"`) + required `output` field — CONTEXT.md does not address this
2. `@nestjs/throttler` v6 `getTracker` can be set in `forRoot` options — no class extension required
3. D-18 exact body format requires a `ThrottlerExceptionFilter` — not covered in CONTEXT.md
4. `zod` current version is 4.4.3 (not 3.x as in STACK.md); openai SDK accepts both `^3.25 || ^4.0` — use zod v4
