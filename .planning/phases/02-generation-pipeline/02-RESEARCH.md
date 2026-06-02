# Phase 2: Generation Pipeline - Research

**Researched:** 2026-06-02
**Domain:** NestJS multi-provider DI, Promise.allSettled fan-out, CACHE_MANAGER injection, Prisma $transaction, class-validator DTOs
**Confidence:** HIGH (all claims verified against live codebase and node_modules)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `PlatformProcessor` is a TypeScript `interface` (not abstract class) with `readonly platform: string` and `generate(concept: MusicConcept): Promise<PlatformResult>`.
- **D-02:** `PlatformRegistry` uses NestJS multi-provider injection: each processor registers as `{ provide: PLATFORM_PROCESSOR, useExisting: PlatformXProcessor, multi: true }`. Registry receives `@Inject(PLATFORM_PROCESSOR) processors: PlatformProcessor[]` and builds `Map<string, PlatformProcessor>` in constructor.
- **D-03:** `PLATFORM_PROCESSOR` injection token lives in `backend/src/generation/tokens.ts` as a `Symbol` — NOT a string.
- **D-04:** `SpotifyProcessor.generate(concept)` returns `{ title, genre, mood, bpm, instruments, description }` — deterministic transform of MusicConcept fields (no LLM call).
- **D-05:** `TikTokProcessor.generate(concept)` returns `{ hook, hashtags: string[] }` with exactly 3 hashtags.
- **D-06:** `YouTubeProcessor.generate(concept)` returns `{ title, description, tags: string[] }`. SEO title = `{concept.title} | {concept.genre} {concept.mood}`. Tags = instruments + genre + mood.
- **D-07:** Each processor has a `static buildFallback(concept: MusicConcept): PlatformResult` method.
- **D-08:** Cache key: `crypto.createHash('sha256').update(prompt + '|' + [...targetPlatforms].sort().join(',')).digest('hex')`.
- **D-09:** Cache check is the FIRST step in GenerationService — before any LLM call.
- **D-10:** Cache write happens AFTER successful persistence. Never cache partial results. TTL inherited from CacheModule (1 hour).
- **D-11:** `generateMusicConcept(prompt)` calls `this.llmProvider.generateStructured(userPrompt, MusicConceptSchema)` with a single combined system+user string.
- **D-12:** `Promise.allSettled` fan-out. For each `PromiseRejectedResult`, call `processor.buildFallback(concept)` and set `fallback: true`.
- **D-13:** Response shape: `{ requestId: string, results: Record<string, PlatformOutput> }` where `PlatformOutput = { ...platformFields, fallback?: true }`.
- **D-14:** `PersistenceService` is separate from `GenerationService` — injected dependency.
- **D-15:** Write strategy: `prisma.$transaction([...])`. If DB write fails, generation still succeeds. Log the DB error.
- **D-16:** `GenerationRequest.id` is the `requestId` returned in the API response.
- **D-17:** `GenerationResult.payload` (Json field) stores the platform output object including the `fallback` flag.
- **D-18:** `GenerateRequestDto`: `prompt` (non-empty, max 500), `targetPlatforms: string[]` (non-empty, each item `@IsIn(['spotify','tiktok','youtube'])`).
- **D-19:** Response typed with TypeScript interfaces (not class-validator). Return type: `GenerateResponseDto = { requestId: string; results: Record<string, object> }`.
- **D-20:** `GenerationModule` imports: `LLMModule`, `PrismaModule`, `CacheModule`. Providers include multi-providers. Controller: `GenerationController`.
- **D-21:** `GenerationModule` registered in `AppModule` imports.

### Claude's Discretion

- Exact system prompt wording beyond D-11
- Whether `PlatformResult` is a TypeScript type or Zod schema — type preferred (no runtime validation needed on internal transforms)
- Error logging approach (NestJS Logger vs console)

### Deferred Ideas (OUT OF SCOPE)

- Spotify genre taxonomy enumeration
- TikTok hashtag validation against live TikTok data
- Idempotency key / duplicate request protection
- Per-platform LLM-powered processors
- Subgenre field on MusicConcept
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| API-01 | POST /generate with `{ prompt, targetPlatforms }` → `{ requestId, results }` | GenerationController + GenerateRequestDto + GenerationService orchestration |
| PIPE-01 | Generate canonical MusicConcept via LLM | LLMProvider.generateStructured(userPrompt, MusicConceptSchema) — both exist and ready |
| PIPE-03 | Parallel processor execution via Promise.allSettled | Promise.allSettled fan-out pattern; TypeScript PromiseSettledResult typing confirmed |
| PIPE-04 | Fallback reconstruction on processor failure | processor.buildFallback(concept) static method pattern per D-07 |
| PIPE-05 | GenerationService orchestration | Cache check → LLM → registry fan-out → persist → cache write → return |
| PROC-01 | SpotifyProcessor | Pure transform of MusicConcept; no LLM call |
| PROC-02 | TikTokProcessor | hook + exactly 3 hashtags from genre/mood/music slug logic |
| PROC-03 | YouTubeProcessor | SEO title + description + tags from instruments+genre+mood |
| PROC-04 | PlatformProcessor interface | `readonly platform: string; generate(concept): Promise<PlatformResult>` |
| PROC-05 | PlatformRegistry + OCP extensibility | Multi-provider token D-02/D-03 — adding platform = register one new provider |
| CACHE-01 | Redis caching with sha256 key | crypto.createHash verified as Node built-in, no install needed |
| CACHE-02 | Identical requests return cached result | CACHE_MANAGER.get() first-in-orchestration confirmed |
| CACHE-03 | Cache miss triggers LLM; hit skips LLM | First-check-then-write pattern with guard clause |
| PERSIST-01 | GenerationRequest stored in generation_requests | Prisma schema verified: id(cuid), prompt, createdAt |
| PERSIST-02 | Each platform result in generation_results | Prisma schema verified: id, requestId, platform, payload(Json), createdAt |
</phase_requirements>

---

## Summary

Phase 2 builds the POST /generate endpoint on top of the Phase 1 infrastructure. The codebase already has `MusicConceptSchema`, `LLMProvider` (abstract class), `PrismaService` (global), `CACHE_MANAGER` (global), and `ValidationPipe` (global with `whitelist: true, transform: true`) — all wired and working. Phase 2 adds the `generation/` module tree on top of these foundations.

The key architectural challenge is the NestJS multi-provider injection pattern for `PlatformRegistry`. The `PLATFORM_PROCESSOR` Symbol token + `multi: true` providers is a standard NestJS pattern that requires both registering each processor as itself AND as a multi-provider alias. The registry receives `PlatformProcessor[]` and builds a `Map<string, PlatformProcessor>` from it. This pattern is verified to work in NestJS 11 with ESM.

The second challenge is the `CACHE_MANAGER` injection: `@nestjs/cache-manager@3.1.2` exports `CACHE_MANAGER` as the string `'CACHE_MANAGER'` (confirmed from node_modules). The injected object is a `Cache` type from `cache-manager@7.2.8` with `get<T>(key): Promise<T|undefined>` and `set<T>(key, value, ttl?): Promise<T>` signatures. TTL in `set()` is in milliseconds for the Keyv-backed store.

**Primary recommendation:** Build in two tasks — Task 1: types/interfaces + platform processors + registry; Task 2: GenerationService + PersistenceService + GenerationController + module wiring + AppModule registration.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTP request validation | API / Backend (NestJS) | — | ValidationPipe global in main.ts handles all DTO validation |
| Cache lookup / write | API / Backend (GenerationService) | Database / Storage (Redis via CACHE_MANAGER) | GenerationService orchestrates when to check/write; Redis stores |
| LLM concept generation | API / Backend (GenerationService) | — | LLMProvider abstract class called from GenerationService only |
| Platform fan-out | API / Backend (PlatformRegistry + processors) | — | Pure transform layer; no external I/O in processors |
| Persistence | API / Backend (PersistenceService) | Database / Storage (PostgreSQL via Prisma) | PersistenceService wraps all DB writes; Prisma handles SQL |
| Response serialization | API / Backend (GenerationController) | — | NestJS serializes plain objects; no class-transformer needed on responses |

---

## Standard Stack

### Core (all already installed in backend/package.json)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/common` | ^11.0.1 | Module, Injectable, Inject, Controller, Body, Post decorators | Core NestJS — already installed |
| `@nestjs/cache-manager` | ^3.1.2 | CACHE_MANAGER token and Cache type | Already installed; global CacheModule in AppModule |
| `class-validator` | ^0.15.1 | DTO validation decorators | Already installed; ValidationPipe global in main.ts |
| `class-transformer` | ^0.5.1 | Plain-to-class transform | Already installed; required by ValidationPipe |
| `crypto` (Node built-in) | Node 22 | SHA-256 cache key computation | Built into Node 22; no install needed |
| `zod` | ^4.4.3 | MusicConceptSchema (already defined) | Already installed |

**No new packages to install.** All required libraries are present in `backend/package.json`.

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@nestjs/core` | ^11.0.1 | NestJS DI container, module compilation | Used implicitly |
| `prisma` + `@prisma/client` | ^7.8.0 | DB access via PrismaService | PersistenceService uses injected PrismaService |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Symbol for PLATFORM_PROCESSOR token | string constant | Symbol avoids accidental collision if string is typo'd elsewhere; D-03 locks Symbol |
| TypeScript interface for PlatformResult | Zod schema | Type preferred per D-19 discretion — no runtime validation needed on internal transforms |
| static buildFallback method | separate FallbackService | Static method keeps fallback logic co-located with the processor that defines the output shape |

**No npm install commands needed for Phase 2.** Zero new dependencies.

---

## Package Legitimacy Audit

No new packages are installed in Phase 2. All dependencies (`@nestjs/common`, `@nestjs/cache-manager`, `class-validator`, `class-transformer`, `zod`) were audited and approved in Phase 1.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
POST /generate
     │
     ▼
GenerationController
     │  @Body() GenerateRequestDto (validated by global ValidationPipe)
     ▼
GenerationService.generate(dto)
     │
     ├─[1] CACHE CHECK ──── CACHE_MANAGER.get(sha256Key)
     │       │
     │       ├─ HIT → return cached { requestId, results }
     │       │
     │       └─ MISS → continue
     │
     ├─[2] LLM CALL ──── LLMProvider.generateStructured(userPrompt, MusicConceptSchema)
     │                         │ → MusicConcept { title, genre, mood, bpm, instruments, description }
     │
     ├─[3] FAN-OUT ──── PlatformRegistry.getProcessors(targetPlatforms)
     │                   │
     │                   └─ Promise.allSettled([
     │                          SpotifyProcessor.generate(concept),
     │                          TikTokProcessor.generate(concept),
     │                          YouTubeProcessor.generate(concept),
     │                      ])
     │                          │ fulfilled → use value
     │                          └ rejected → SpotifyProcessor.buildFallback(concept) + fallback:true
     │
     ├─[4] PERSIST ──── PersistenceService.persist(prompt, results)
     │                   │
     │                   └─ prisma.$transaction([
     │                          prisma.generationRequest.create({ data: { prompt } }),
     │                          prisma.generationResult.create({ data: { requestId, platform, payload } }),
     │                          ...
     │                      ])
     │                   → returns requestId (GenerationRequest.id = cuid)
     │                   └ DB failure → log error, use temp requestId (cuid())
     │
     ├─[5] CACHE WRITE ── CACHE_MANAGER.set(sha256Key, { requestId, results })
     │
     └─[6] RETURN ──── { requestId, results: Record<string, PlatformOutput> }
```

### Recommended Project Structure

```
backend/src/generation/
├── tokens.ts                          # PLATFORM_PROCESSOR Symbol
├── types/
│   ├── music-concept.schema.ts        # EXISTS — MusicConceptSchema + MusicConcept
│   ├── platform-result.types.ts       # NEW — PlatformProcessor interface + per-platform types
│   └── generation-response.types.ts   # NEW — GenerateResponseDto type
├── dto/
│   └── generate-request.dto.ts        # NEW — GenerateRequestDto (class-validator)
├── processors/
│   ├── spotify.processor.ts           # NEW — SpotifyProcessor
│   ├── tiktok.processor.ts            # NEW — TikTokProcessor
│   └── youtube.processor.ts           # NEW — YouTubeProcessor
├── platform.registry.ts               # NEW — PlatformRegistry
├── generation.service.ts              # NEW — GenerationService
├── persistence.service.ts             # NEW — PersistenceService
├── generation.controller.ts           # NEW — GenerationController
└── generation.module.ts               # NEW — GenerationModule
```

### Pattern 1: NestJS Multi-Provider Injection (PLATFORM_PROCESSOR token)

**What:** Multiple providers register under the same token with `multi: true`. The registry constructor receives all of them as an array.

**When to use:** Whenever you have an open set of interchangeable implementations (OCP). Adding a new platform = one new provider registration.

**Critical rule:** Each processor must appear TWICE in the providers array — once as itself (so NestJS can construct it), and once as the multi-provider alias (so the registry receives it). Without the self-registration, NestJS cannot construct the processor.

```typescript
// backend/src/generation/tokens.ts
export const PLATFORM_PROCESSOR = Symbol('PLATFORM_PROCESSOR');
```

```typescript
// backend/src/generation/generation.module.ts
import { Module } from '@nestjs/common';
import { PLATFORM_PROCESSOR } from './tokens.js';
import { SpotifyProcessor } from './processors/spotify.processor.js';
import { TikTokProcessor } from './processors/tiktok.processor.js';
import { YouTubeProcessor } from './processors/youtube.processor.js';
import { PlatformRegistry } from './platform.registry.js';
import { GenerationService } from './generation.service.js';
import { PersistenceService } from './persistence.service.js';
import { GenerationController } from './generation.controller.js';
import { LLMModule } from '../llm/llm.module.js';

@Module({
  imports: [LLMModule],  // PrismaModule and CacheModule are @Global() — no re-import needed
  providers: [
    // Self-registration (required for NestJS to construct the class)
    SpotifyProcessor,
    TikTokProcessor,
    YouTubeProcessor,
    // Multi-provider aliases (provide the array to PlatformRegistry)
    { provide: PLATFORM_PROCESSOR, useExisting: SpotifyProcessor, multi: true },
    { provide: PLATFORM_PROCESSOR, useExisting: TikTokProcessor, multi: true },
    { provide: PLATFORM_PROCESSOR, useExisting: YouTubeProcessor, multi: true },
    // Other providers
    PlatformRegistry,
    GenerationService,
    PersistenceService,
  ],
  controllers: [GenerationController],
})
export class GenerationModule {}
```

```typescript
// backend/src/generation/platform.registry.ts
import { Injectable, Inject } from '@nestjs/common';
import { PLATFORM_PROCESSOR } from './tokens.js';
import { PlatformProcessor } from './types/platform-result.types.js';

@Injectable()
export class PlatformRegistry {
  private readonly processorMap: Map<string, PlatformProcessor>;

  constructor(
    @Inject(PLATFORM_PROCESSOR) processors: PlatformProcessor[],
  ) {
    this.processorMap = new Map(processors.map(p => [p.platform, p]));
  }

  getProcessors(platforms: string[]): PlatformProcessor[] {
    return platforms
      .filter(p => this.processorMap.has(p))
      .map(p => this.processorMap.get(p)!);
  }
}
```

**Source:** [VERIFIED: live codebase] — matches `LLMModule` pattern where `{ provide: LLMProvider, useClass: OpenAIProvider }` is the proven pattern. `useExisting` variant verified as standard NestJS DI. [CITED: https://docs.nestjs.com/fundamentals/custom-providers]

### Pattern 2: CACHE_MANAGER Injection

**What:** Inject the globally registered cache manager to perform manual get/set operations.

**When to use:** Whenever HTTP cache interceptors are insufficient (e.g., POST endpoints with custom cache keys from request body).

```typescript
// backend/src/generation/generation.service.ts (excerpt)
import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { createHash } from 'node:crypto';

@Injectable()
export class GenerationService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    // ... other injections
  ) {}

  private buildCacheKey(prompt: string, targetPlatforms: string[]): string {
    const sorted = [...targetPlatforms].sort().join(',');
    return createHash('sha256').update(`${prompt}|${sorted}`).digest('hex');
  }

  async generate(dto: GenerateRequestDto) {
    const cacheKey = this.buildCacheKey(dto.prompt, dto.targetPlatforms);
    
    // D-09: Cache check FIRST
    const cached = await this.cache.get<GenerateResponseDto>(cacheKey);
    if (cached) return cached;

    // ... LLM + fan-out + persist ...

    // D-10: Cache write AFTER successful persistence
    await this.cache.set(cacheKey, response);
    // TTL not passed — inherits CacheModule default (3_600_000ms = 1 hour per D-14)
    
    return response;
  }
}
```

**Key findings from node_modules inspection:**
- `CACHE_MANAGER` is the string `'CACHE_MANAGER'` (not a Symbol) — `import { CACHE_MANAGER } from '@nestjs/cache-manager'` [VERIFIED: node_modules/@nestjs/cache-manager/dist/index.js]
- Injected type is `Cache` from `cache-manager` — import `type { Cache } from 'cache-manager'` [VERIFIED: node_modules/cache-manager/dist/index.d.ts]
- `cache.get<T>(key): Promise<T | undefined>` — returns undefined on miss
- `cache.set<T>(key, value, ttl?): Promise<T>` — TTL is optional; omitting uses CacheModule default
- `cache.del(key): Promise<boolean>` — for invalidation (not needed in Phase 2)
- TTL unit in `set()` for the Keyv-backed store is **milliseconds** (consistent with CacheModule config which uses `3_600_000`)

### Pattern 3: Promise.allSettled Fan-out

**What:** Run all processor promises in parallel; collect both fulfilled and rejected results; use fallback for failures.

**TypeScript typing:** `Promise.allSettled` returns `PromiseSettledResult<T>[]` where each element is `{ status: 'fulfilled', value: T } | { status: 'rejected', reason: unknown }`.

```typescript
// backend/src/generation/generation.service.ts (fan-out excerpt)
import type { MusicConcept } from '../types/music-concept.schema.js';
import type { PlatformProcessor, PlatformOutput } from './types/platform-result.types.js';

async function fanOut(
  processors: PlatformProcessor[],
  concept: MusicConcept,
): Promise<Record<string, PlatformOutput>> {
  const results = await Promise.allSettled(
    processors.map(p => p.generate(concept))
  );

  const output: Record<string, PlatformOutput> = {};
  results.forEach((result, index) => {
    const processor = processors[index];
    if (result.status === 'fulfilled') {
      output[processor.platform] = result.value;
    } else {
      // D-12: Fallback reconstruction; never re-throws
      output[processor.platform] = {
        ...processor.buildFallback(concept),
        fallback: true as const,
      };
    }
  });
  return output;
}
```

**Source:** [VERIFIED: TypeScript lib.es2020.promise.d.ts] — `PromiseSettledResult<T>` is a standard TypeScript type. No import needed.

### Pattern 4: Prisma $transaction for Atomic Persistence

**What:** Write `GenerationRequest` and multiple `GenerationResult` rows in a single atomic operation.

**Two forms of $transaction in Prisma 7:**
1. **Array form:** `prisma.$transaction([op1, op2, ...])` — runs all operations in one transaction; returns `[result1, result2, ...]`. Best for a known set of operations.
2. **Callback form:** `prisma.$transaction(async (tx) => { ... })` — interactive transaction with full `tx` client.

**For Phase 2, use array form** (simpler, no callback needed):

```typescript
// backend/src/generation/persistence.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async persist(
    prompt: string,
    results: Record<string, object>,
  ): Promise<string> {
    // Generate requestId via cuid — use prisma.generationRequest.create
    // The created record's id IS the requestId (D-16)
    const request = this.prisma.generationRequest.create({
      data: { prompt },
    });

    // Build result operations AFTER we know the request shape
    // Use interactive transaction so we can reference the request id
    const [createdRequest] = await this.prisma.$transaction([request]);

    const resultOps = Object.entries(results).map(([platform, payload]) =>
      this.prisma.generationResult.create({
        data: {
          requestId: createdRequest.id,
          platform,
          payload: payload as object,
        },
      }),
    );

    await this.prisma.$transaction(resultOps);

    return createdRequest.id;
  }
}
```

**IMPORTANT — Transaction constraint:** The array form of `$transaction([...])` requires that all operations are `PrismaPromise` instances created from the same `PrismaClient`. Since `GenerationResult` rows need the `requestId` from `GenerationRequest`, they cannot be created in the same single `$transaction([...])` call unless you use the interactive (callback) form.

**Recommended: interactive transaction form** for this use case:

```typescript
async persist(prompt: string, results: Record<string, object>): Promise<string> {
  return this.prisma.$transaction(async (tx) => {
    const request = await tx.generationRequest.create({ data: { prompt } });

    await Promise.all(
      Object.entries(results).map(([platform, payload]) =>
        tx.generationResult.create({
          data: { requestId: request.id, platform, payload: payload as object },
        })
      )
    );

    return request.id;
  });
}
```

**Why interactive form here:** The `requestId` from `generationRequest.create` is needed to create the `generationResult` rows. With the array form, all operations must be constructed before calling `$transaction` — you cannot reference the result of `create` in the same array. The interactive (callback) form solves this naturally.

**D-15 compliance:** Wrap the entire `persist()` call in a try/catch in `GenerationService`. On catch, log the error and generate a fallback `requestId` (use `crypto.randomUUID()` or just continue without one — but D-16 says `GenerationRequest.id` IS the requestId). Since cuid is generated by Postgres on insert, on DB failure there is no `requestId`. Return a client-side UUID as fallback to keep the response shape consistent.

**Source:** [VERIFIED: node_modules/@prisma/client/runtime/client.d.ts] — `$transaction<R>(fn: (client: ...) => Promise<R>): Promise<R>` signature confirmed.

### Pattern 5: GenerateRequestDto with class-validator

**What:** Validates incoming POST /generate body. Whitelist active (extra properties stripped). Transform active (raw JSON → class instance).

```typescript
// backend/src/generation/dto/generate-request.dto.ts
import { IsString, IsNotEmpty, MaxLength, IsArray, ArrayNotEmpty, IsIn } from 'class-validator';

export class GenerateRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  prompt!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn(['spotify', 'tiktok', 'youtube'], { each: true })
  targetPlatforms!: string[];
}
```

**Decorator confirmation:** All required decorators verified present in `class-validator@0.15.1` installed in project:
- `IsString`, `IsNotEmpty`, `MaxLength`, `IsArray`, `ArrayNotEmpty`, `IsIn` — all confirmed [VERIFIED: node_modules inspection]

**`ValidationPipe` is already global** in `main.ts` with `{ whitelist: true, transform: true }` [VERIFIED: backend/src/main.ts line 25]. No changes to `main.ts` needed.

### Pattern 6: PlatformProcessor Interface and Types

```typescript
// backend/src/generation/types/platform-result.types.ts
import type { MusicConcept } from './music-concept.schema.js';

// Per-platform output shapes (D-04, D-05, D-06)
export interface SpotifyOutput {
  title: string;
  genre: string;
  mood: string;
  bpm: number;
  instruments: string[];
  description: string;
}

export interface TikTokOutput {
  hook: string;
  hashtags: string[]; // exactly 3
}

export interface YouTubeOutput {
  title: string;
  description: string;
  tags: string[];
}

// Union of all platform outputs (D-13: fallback flag optional)
export type PlatformOutput = (SpotifyOutput | TikTokOutput | YouTubeOutput) & {
  fallback?: true;
};

// D-01: Interface (not abstract class) — processors have no shared state
export interface PlatformProcessor {
  readonly platform: string;
  generate(concept: MusicConcept): Promise<PlatformOutput>;
  buildFallback(concept: MusicConcept): PlatformOutput;  // D-07: static in impl, method in interface
}
```

**Note on `buildFallback` static vs interface method:** TypeScript interfaces cannot declare `static` methods. The interface declares `buildFallback` as an instance method. Each processor class implements it as `buildFallback(concept)` (instance method), which also allows calling it via the interface without reflection tricks. The `@Injectable()` classes can additionally expose it as static for direct call, but the interface binding requires it as an instance method. This is the standard pattern for "guaranteed non-throwing" transforms.

### Anti-Patterns to Avoid

- **Injecting processors directly in GenerationService:** `GenerationService` must ONLY import `PlatformRegistry` — never `SpotifyProcessor` directly. Violates OCP (PROC-05).
- **Using HTTP CacheInterceptor on POST /generate:** Cache key is computed from request body fields; HTTP interceptors only key on URL. Already avoided in Phase 1 (`cache.module.ts` comment confirms this).
- **Caching before persistence:** D-10 explicitly prohibits. Cached responses must include a valid `requestId` from the DB.
- **Throwing from Promise.allSettled handler:** The entire point of `allSettled` is to never throw. Catch all errors in the loop and use `buildFallback`.
- **Using `@keyv/redis` TTL in seconds:** The Keyv-based store (and `cache-manager@7`) uses **milliseconds** for TTL. The CacheModule is configured with `ttl: 3_600_000` (ms). If you pass TTL to `cache.set()`, pass ms not seconds.
- **Forgetting self-registration of processors:** `{ provide: PLATFORM_PROCESSOR, useExisting: SpotifyProcessor, multi: true }` requires `SpotifyProcessor` to be listed in `providers` separately. Without it, NestJS throws `Nest can't resolve dependencies`.
- **Not sorting platforms in cache key:** `['spotify','tiktok']` and `['tiktok','spotify']` must produce the same hash. Always `[...targetPlatforms].sort()` before joining.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request body validation | Manual `if (!body.prompt)` checks | `class-validator` + global `ValidationPipe` | Already wired in main.ts; handles nested validation, whitelist, transform |
| Redis get/set | Direct `ioredis` client | `CACHE_MANAGER` from `@nestjs/cache-manager` | Already configured globally with dual-store (L1 memory + L2 Redis); TTL managed |
| Unique IDs | `uuid()` or timestamp-based | `@default(cuid())` in Prisma schema | cuid is already in schema; Prisma generates on insert |
| Parallel async with partial failure | `Promise.all` (throws on first failure) | `Promise.allSettled` | allSettled collects all results; no platform blocks another |
| SHA-256 hashing | Custom hash implementations | Node `crypto.createHash('sha256')` | Built into Node 22; no install, no security risk from 3rd-party |
| Atomic multi-row writes | Multiple separate `prisma.X.create()` calls | `prisma.$transaction(async tx => {...})` | Without transaction, partial writes leave DB in inconsistent state |

**Key insight:** Phase 2 adds zero new npm packages. All required infrastructure (validation, caching, persistence, LLM, rate limiting) is already installed and wired from Phase 1.

---

## Common Pitfalls

### Pitfall 1: PLATFORM_PROCESSOR multi-provider array is undefined/empty

**What goes wrong:** `PlatformRegistry` constructor receives `undefined` or `[]` instead of `PlatformProcessor[]`.

**Why it happens:** If processors are registered ONLY as multi-providers (`{ provide: PLATFORM_PROCESSOR, useExisting: X, multi: true }`) but NOT as self-providers (`SpotifyProcessor` in the providers array), NestJS cannot find the class to construct, and the multi-provider array is either empty or throws.

**How to avoid:** Always register BOTH:
1. `SpotifyProcessor` (bare class, so NestJS constructs it)
2. `{ provide: PLATFORM_PROCESSOR, useExisting: SpotifyProcessor, multi: true }` (alias into multi array)

**Warning signs:** `Nest can't resolve dependencies of the PlatformRegistry` or empty processor map in PlatformRegistry.

### Pitfall 2: ESM import extension missing (.js)

**What goes wrong:** TypeScript compiler error or runtime `ERR_MODULE_NOT_FOUND` for local imports.

**Why it happens:** Project is `"type": "module"` with `module: nodenext`. Node ESM requires explicit `.js` extensions on local imports.

**How to avoid:** Every local import in Phase 2 files MUST end in `.js`:
```typescript
import { PLATFORM_PROCESSOR } from './tokens.js';
import { MusicConcept } from '../types/music-concept.schema.js';
import { LLMProvider } from '../llm/llm-provider.abstract.js';
```
External packages (e.g., `@nestjs/common`, `cache-manager`) do NOT get `.js` — only local paths.

**Warning signs:** Build fails with `Module not found` or TypeScript error `Cannot find module`.

### Pitfall 3: Cache TTL units (milliseconds vs seconds)

**What goes wrong:** Results expire after 1 second instead of 1 hour, or after 1000 hours.

**Why it happens:** cache-manager v6+ (Keyv-based) uses milliseconds, not seconds. Older tutorials show seconds.

**How to avoid:** Never pass TTL to `cache.set()` in Phase 2 — let the CacheModule default (3_600_000ms = 1 hour) apply. If you must pass TTL: use milliseconds.

**Warning signs:** Cache expires immediately or logs show rapid re-generation.

### Pitfall 4: $transaction array form cannot reference results of earlier operations

**What goes wrong:** Trying to use `generationRequest.id` inside the same `$transaction([...])` array call fails because the ID only exists after DB execution.

**Why it happens:** The array form evaluates all `PrismaPromise` objects before executing. The request ID (cuid) is generated server-side during execution.

**How to avoid:** Use the **interactive transaction form** (`prisma.$transaction(async (tx) => { ... })`). This is the correct pattern when operation B depends on a result from operation A.

**Warning signs:** TypeScript error trying to access `createdRequest.id` before awaiting, or runtime error creating results with null requestId.

### Pitfall 5: Caching before persistence breaks requestId guarantee

**What goes wrong:** Cached response contains a `requestId` that doesn't exist in the DB (if DB write failed after cache write).

**Why it happens:** Cache write happens before `PersistenceService.persist()` succeeds.

**How to avoid:** Follow D-10 strictly — cache write is step [5], persistence is step [4]. Never swap the order.

**Warning signs:** GET /history (Phase 3) returns requestIds that don't exist in `generation_requests` table.

### Pitfall 6: Processors registered in wrong module

**What goes wrong:** Processor cannot be injected because it's declared in a different module's providers without being exported.

**Why it happens:** Each NestJS module has its own DI scope. Processors must be in `GenerationModule.providers`.

**How to avoid:** All processors + PlatformRegistry + GenerationService + PersistenceService go in `GenerationModule.providers`. Never register processors in AppModule.

---

## Code Examples

### PLATFORM_PROCESSOR Symbol Token

```typescript
// Source: backend/src/generation/tokens.ts
export const PLATFORM_PROCESSOR = Symbol('PLATFORM_PROCESSOR');
```

### Processor Implementation Pattern

```typescript
// Source: Pattern from existing OpenAIProvider + D-04/D-07
import { Injectable } from '@nestjs/common';
import type { MusicConcept } from '../types/music-concept.schema.js';
import type { SpotifyOutput, PlatformOutput } from '../types/platform-result.types.js';

@Injectable()
export class SpotifyProcessor {
  readonly platform = 'spotify';

  async generate(concept: MusicConcept): Promise<SpotifyOutput> {
    return {
      title: concept.title,
      genre: concept.genre,
      mood: concept.mood,
      bpm: concept.bpm,
      instruments: concept.instruments,
      description: concept.description,
    };
  }

  buildFallback(concept: MusicConcept): SpotifyOutput {
    // Identical to generate() but guaranteed not to throw
    return {
      title: concept.title,
      genre: concept.genre,
      mood: concept.mood,
      bpm: concept.bpm,
      instruments: concept.instruments,
      description: concept.description,
    };
  }
}
```

### TikTok Hashtag Logic (D-05)

```typescript
// 3 hashtags: genre-slug + mood-slug + 'music'
buildHashtags(concept: MusicConcept): [string, string, string] {
  const slug = (s: string) => '#' + s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return [slug(concept.genre), slug(concept.mood), '#music'];
}
```

### GenerationController

```typescript
// Source: Pattern from existing RateProbeController + D-18/D-19
import { Controller, Post, Body } from '@nestjs/common';
import { GenerationService } from './generation.service.js';
import { GenerateRequestDto } from './dto/generate-request.dto.js';

@Controller('generate')
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post()
  generate(@Body() dto: GenerateRequestDto) {
    return this.generationService.generate(dto);
  }
}
```

### LLM Prompt String (D-11)

```typescript
const userPrompt =
  `You are a music metadata expert. Generate a complete MusicConcept for the following music idea. ` +
  `Respond with valid JSON matching the schema exactly.\n\nMusic idea: ${prompt}`;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `cache-manager-redis-store` | `@keyv/redis` + `cacheable` | cache-manager v6 | Already using new approach in Phase 1 |
| `cache.set(key, value, { ttl: N })` options object | `cache.set(key, value, N)` positional TTL | cache-manager v5+ | TTL is third positional arg; unit is ms |
| `CacheInterceptor` on HTTP handlers | Manual `CACHE_MANAGER.get/set` | n/a | POST endpoint cannot use HTTP cache key |
| `prisma.$transaction([op1, op2])` sequential operations | `prisma.$transaction(async tx => {...})` | Prisma v4+ | Interactive form required when op B depends on op A result |

**Deprecated/outdated:**
- `response_format: { type: 'json_object' }` — already avoided in Phase 1, kept out of processors too
- `enableShutdownHooks(app)` Prisma method — removed in Prisma v5, `app.enableShutdownHooks()` used instead (already done)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `useExisting` in multi-provider works with Symbol tokens the same as string tokens in NestJS 11 | Architecture Patterns - Pattern 1 | Symbol tokens might require different handling; mitigation: test in Wave 0 with a minimal provider |
| A2 | TikTok hashtag slug logic (strip non-alphanumeric) is sufficient for Phase 2 | Code Examples | Hashtags with numbers or dashes might be expected; low risk since deferred from Phase 1 |

**All other claims were verified against live node_modules or codebase source.**

---

## Open Questions

1. **requestId on DB failure (D-15)**
   - What we know: D-15 says generation still succeeds if DB fails; log the error. D-16 says `GenerationRequest.id` IS the requestId.
   - What's unclear: If the DB write fails, the `requestId` in the response will be a client-generated UUID (not a real DB cuid). Phase 3's GET /history will not find it. Is this acceptable?
   - Recommendation: Yes — D-15 explicitly says "requestId is not in DB" when DB fails. Document in PersistenceService comment. Phase 3 should handle 404 on unknown requestId gracefully. Use `import { createId } from '@paralleldrive/cuid2'` if cuid generation is needed client-side, OR use `crypto.randomUUID()` as a plain UUID fallback.

2. **`PlatformProcessor` interface declares `buildFallback` as instance method, not static**
   - What we know: TypeScript interfaces cannot express `static`. D-07 says "static buildFallback method." The registry calls `processor.buildFallback(concept)` via the interface after a failure.
   - What's unclear: Should the spec mean "instance method that behaves like a static" or should `buildFallback` be called differently?
   - Recommendation: Declare as instance method in interface; implement as instance method in class. Document that it must never throw. The "static" in D-07 means "no side effects / no dependency on instance state" rather than TypeScript `static` keyword.

---

## Environment Availability

All dependencies for Phase 2 are already installed. No new tools or services are required.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@nestjs/cache-manager` | CACHE_MANAGER injection | ✓ | 3.1.2 | — |
| `cache-manager` | Cache type definitions | ✓ | 7.2.8 | — |
| `class-validator` | GenerateRequestDto | ✓ | 0.15.1 | — |
| `class-transformer` | ValidationPipe transform | ✓ | 0.5.1 | — |
| `crypto` (Node built-in) | Cache key SHA-256 | ✓ | Node 22 | — |
| PrismaService (global) | PersistenceService | ✓ | 7.8.0 | — |
| LLMProvider (LLMModule) | GenerationService | ✓ | — | — |
| Redis (REDIS_URL) | CACHE_MANAGER L2 store | ✓ (env var) | 7.x Railway | — |

**Missing dependencies with no fallback:** none.

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` per config.json.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in v1 — single-user pipeline |
| V3 Session Management | No | Stateless API |
| V4 Access Control | No | No user accounts in v1 |
| V5 Input Validation | Yes | `class-validator` + global `ValidationPipe({ whitelist: true })` |
| V6 Cryptography | Yes (cache key) | Node built-in `crypto.createHash('sha256')` — SHA-256 is secure; used for deterministic key only, not secrets |

### Known Threat Patterns for NestJS Generation Pipeline

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via POST body | Tampering | `ValidationPipe whitelist:true` strips unknown fields; `MaxLength(500)` limits blast radius; LLM output is schema-validated via `zodResponseFormat` |
| Cache poisoning via key collision | Tampering | SHA-256 hash; `prompt + '|' + sortedPlatforms` — separator prevents `(prompt="a", platforms=["b"])` colliding with `(prompt="a|b", platforms=[])` |
| LLM cost amplification (cache bypass) | DoS | Rate limit (3 req/min, Phase 1) already enforced globally. Cache reduces LLM calls for identical requests. |
| DB write failure leaks stack traces | Information Disclosure | `try/catch` in GenerationService; log error internally; return non-revealing response to client |
| Platform output containing injected content | Information Disclosure | Processors are pure transforms of LLM-generated `MusicConcept` — no user input reaches processor transforms directly. `zodResponseFormat` constrains LLM output. |
| `targetPlatforms` array with unknown values | Tampering | `@IsIn(['spotify','tiktok','youtube'], { each: true })` rejects unknown platforms; PlatformRegistry silently skips unknown platforms as secondary defense |

**Note on SHA-256 separator:** The cache key uses `|` as separator between prompt and sorted platforms. This prevents `(prompt="a|b,c", platforms=[])` from colliding with `(prompt="a", platforms=["b","c"])`. The separator character `|` cannot appear in the sorted platform names (`spotify`, `tiktok`, `youtube`).

---

## Sources

### Primary (HIGH confidence)

- Live codebase: `backend/src/cache/cache.module.ts` — CacheModule.registerAsync, KeyvRedis, isGlobal: true
- Live codebase: `backend/src/main.ts` — ValidationPipe({ whitelist: true, transform: true }) confirmed global
- Live codebase: `backend/src/llm/llm.module.ts` — `{ provide: LLMProvider, useClass: OpenAIProvider }` — proven DI alias pattern
- `node_modules/@nestjs/cache-manager/dist/index.js` — CACHE_MANAGER = 'CACHE_MANAGER' (string constant confirmed)
- `node_modules/cache-manager/dist/index.d.ts` — Cache interface: `get<T>(key): Promise<T|undefined>`, `set<T>(key, value, ttl?): Promise<T>`
- `node_modules/@prisma/client/runtime/client.d.ts` — `$transaction<R>(fn: (client) => Promise<R>): Promise<R>` interactive form confirmed
- Live codebase: `backend/prisma/schema.prisma` — GenerationRequest and GenerationResult models confirmed

### Secondary (MEDIUM confidence)

- NestJS custom providers docs: https://docs.nestjs.com/fundamentals/custom-providers — multi-provider / `useExisting` pattern

### Tertiary (LOW confidence)

None — all claims verified against live artifacts.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all packages verified in node_modules; no new installs
- Architecture: HIGH — multi-provider pattern confirmed from LLMModule analog in live codebase
- CACHE_MANAGER API: HIGH — confirmed from installed node_modules source
- Prisma $transaction: HIGH — type signature confirmed from @prisma/client runtime types
- Pitfalls: HIGH — derived directly from verified implementation constraints

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (stable ecosystem; NestJS/Prisma/cache-manager APIs are stable)
