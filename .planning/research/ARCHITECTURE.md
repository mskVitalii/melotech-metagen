# Architecture Patterns

**Domain:** AI music content distribution pipeline
**Researched:** 2026-06-02
**Stack:** NestJS + Prisma + PostgreSQL + Redis (prescribed)

---

## Recommended Architecture

### System Overview

```
Client (Next.js)
     |
     | POST /generate { prompt, platforms[] }
     v
[GenerationController]
     |
     v
[GenerationService]  ←──── [CacheService (Redis)]
     |                            |
     | cache miss                 | cache hit → return cached
     v
[LLMService]  ←── [LLMProvider interface] ←── [OpenAIProvider]
     |
     | MusicConcept (canonical intermediary)
     v
[PlatformRegistry]
     |
     | resolves N processors
     v
Promise.allSettled([
  SpotifyProcessor.process(concept),
  TikTokProcessor.process(concept),
  YouTubeProcessor.process(concept),
])
     |
     v
[GenerationService]  (merge results, mark failures)
     |
     v
[PersistenceService / PrismaService]
     |  ├─ INSERT generation_requests
     |  └─ INSERT generation_results (one row per platform)
     v
HTTP Response + cache.set(key, result)
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `GenerationController` | Validates HTTP request, delegates to service, formats HTTP response | `GenerationService` |
| `GenerationService` | Orchestrates pipeline: cache check → LLM call → processor fan-out → persist → cache write | `CacheService`, `LLMService`, `PlatformRegistry`, `PersistenceService` |
| `LLMService` | Constructs LLM prompt, calls `LLMProvider`, parses `MusicConcept` from response | `LLMProvider` interface |
| `LLMProvider` (interface) | Single method: `complete(prompt): Promise<string>` | External LLM API (OpenAI) |
| `OpenAIProvider` | Concrete LLM implementation using OpenAI SDK | OpenAI REST API |
| `PlatformRegistry` | Maintains `Map<string, PlatformProcessor>`, resolves by name | All `PlatformProcessor` implementations |
| `PlatformProcessor` (interface) | Single method: `process(concept: MusicConcept): Promise<PlatformOutput>` | `MusicConcept` data shape |
| `SpotifyProcessor` | Transforms `MusicConcept` → Spotify-shaped output | `PlatformProcessor` interface |
| `TikTokProcessor` | Transforms `MusicConcept` → TikTok hook + hashtags | `PlatformProcessor` interface |
| `YouTubeProcessor` | Transforms `MusicConcept` → SEO title + description + tags | `PlatformProcessor` interface |
| `CacheService` | Wraps `@nestjs/cache-manager` + Keyv/Redis; exposes `get(key)`, `set(key, value, ttl)` | Redis |
| `PersistenceService` | Wraps `PrismaService`; provides `saveGenerationRequest()`, `saveResults()`, `findHistory()` | Prisma / PostgreSQL |
| `HistoryController` | Handles `GET /history` with pagination + platform filter | `PersistenceService` |
| `ThrottlerGuard` | Enforces 3 req/min per client IP; backed by Redis storage | Redis (via `ThrottlerStorageRedisService`) |

---

## Data Flow

### Happy Path (cache miss)

```
1. HTTP POST /generate
   body: { prompt: "dark ambient drone", platforms: ["spotify", "youtube"] }

2. GenerationService.generate(dto)
   a. cacheKey = sha256(prompt + sortedPlatforms.join(','))
   b. cached = await cacheService.get(cacheKey)
   c. if (cached) return cached  // skip steps 3-7

3. LLMService.generateConcept(prompt)
   → sends structured prompt to OpenAI
   → parses JSON response into MusicConcept {
       title, genre, mood, bpm, instruments, description
     }

4. PlatformRegistry.resolve(platforms)
   → returns [SpotifyProcessor, YouTubeProcessor]

5. Promise.allSettled([
     spotifyProcessor.process(concept),
     youtubeProcessor.process(concept),
   ])
   → each processor transforms concept deterministically (no LLM call)
   → results: [
       { status: 'fulfilled', value: SpotifyOutput },
       { status: 'fulfilled', value: YouTubeOutput },
     ]

6. GenerationService merges results
   → fulfilled: include output
   → rejected: include { error: true, fallback: reconstructed from MusicConcept }

7. PersistenceService.save(request, results)
   → INSERT generation_requests (prompt, platforms[], created_at)
   → INSERT generation_results[] (request_id, platform, output_json, is_fallback)

8. cacheService.set(cacheKey, mergedResult, ttl: 3600s)

9. Return HTTP 200 with merged result
```

### Failure Path (partial processor failure)

```
5. Promise.allSettled results include rejected:
   { status: 'rejected', reason: Error }

6. GenerationService for each rejected result:
   → calls processor.fallback(concept)  OR
   → GenerationService reconstructs minimal output from MusicConcept fields
   → marks output with { isFallback: true }

Note: The full pipeline still succeeds. Only the failed platform's output
is marked. This is the "partial degradation" contract.
```

### Cache Hit Path

```
1. HTTP POST /generate
2. cacheKey computed
3. Redis hit → return cached response immediately
   (no LLM call, no processor execution, no DB write)
```

---

## Architecture Decision Rationale

### Decision 1: Canonical MusicConcept Intermediary (VALIDATED pattern)

**Pattern:** One LLM call produces `MusicConcept`; N processors transform it deterministically.

**Why over per-platform LLM calls:**
- Cost: 1 token-call vs N token-calls per request
- Consistency: All platforms derive from the same source truth — no contradictory outputs
- Testability: Processors become pure functions (MusicConcept in, PlatformOutput out) — easily unit-tested without LLM mocking
- Fallback: If a processor fails, MusicConcept is already available for reconstruction without a second LLM call
- Caching: The cache stores the full merged result keyed by input — one cache entry covers all platforms

**Tradeoff accepted:** Platform-specific LLM calls could theoretically produce richer output (e.g., TikTok-native hook generation). Rejected because complexity and cost outweigh marginal quality gain at this scale.

**Confidence:** HIGH — standard fan-out pattern for content transformation pipelines

---

### Decision 2: PlatformRegistry — NestJS Multi-Provider Token Pattern

**Recommended approach:** Use `multi: true` custom providers + a `PlatformRegistry` service that ingests the injected array.

```typescript
// tokens.ts
export const PLATFORM_PROCESSOR = 'PLATFORM_PROCESSOR';

// spotify.module.ts
@Module({
  providers: [
    SpotifyProcessor,
    {
      provide: PLATFORM_PROCESSOR,
      useExisting: SpotifyProcessor,
      multi: true,   // NestJS multi-provider
    },
  ],
  exports: [PLATFORM_PROCESSOR],
})
export class SpotifyModule {}

// platform-registry.service.ts
@Injectable()
export class PlatformRegistry {
  private map = new Map<string, PlatformProcessor>();

  constructor(
    @Inject(PLATFORM_PROCESSOR) processors: PlatformProcessor[],
  ) {
    processors.forEach(p => this.map.set(p.platformName, p));
  }

  resolve(names: string[]): PlatformProcessor[] {
    return names.map(n => {
      const p = this.map.get(n);
      if (!p) throw new Error(`Unknown platform: ${n}`);
      return p;
    });
  }
}
```

**Why multi-provider over alternatives:**
- Adding a new platform = add a new module that provides `{ provide: PLATFORM_PROCESSOR, useExisting: NewProcessor, multi: true }` and import it in `AppModule`. Zero changes to existing code (open/closed principle).
- Alternative (manual Map): requires `PlatformRegistry` to know about all processors — violates open/closed.
- Alternative (factory provider + string map): equivalent complexity but less idiomatic.

**Confidence:** HIGH — multi:true is documented NestJS behavior (source: nestjs/docs.nestjs.com/dependency-injection.md)

---

### Decision 3: LLMProvider Interface — Abstract Class Token

**Recommended approach:** Abstract class as DI token + `useClass` provider override.

```typescript
// llm-provider.abstract.ts
export abstract class LLMProvider {
  abstract complete(prompt: string): Promise<string>;
}

// llm.module.ts
@Module({
  providers: [
    OpenAIProvider,
    {
      provide: LLMProvider,
      useClass: OpenAIProvider,
    },
  ],
  exports: [LLMProvider],
})
export class LLMModule {}

// llm.service.ts
@Injectable()
export class LLMService {
  constructor(private readonly llmProvider: LLMProvider) {}
  // no @Inject() needed — abstract class token is directly resolvable
}
```

**Why abstract class over TypeScript interface:**
- TypeScript interfaces are erased at runtime — they cannot be used as DI tokens.
- Abstract classes survive compilation and are valid injection tokens.
- Swapping to Anthropic or Gemini = change `useClass: AnthropicProvider` in one module. Zero consumer changes.

**Why not ConfigurableModuleBuilder:**
- ConfigurableModuleBuilder is for modules that accept configuration options (forRoot/forRootAsync pattern). The LLMProvider swap is a class-level concern, not a module-options concern.
- Simpler: abstract class + useClass is 8 lines, ConfigurableModuleBuilder adds ceremony for no gain here.

**Confidence:** HIGH — useClass with abstract token is documented NestJS pattern (source: nestjs/docs.nestjs.com/dependency-injection.md)

---

### Decision 4: Parallel Processor Execution — Promise.allSettled

**Pattern:**

```typescript
const processors = this.registry.resolve(dto.platforms);
const results = await Promise.allSettled(
  processors.map(p => p.process(concept))
);

const output = results.map((result, i) => {
  const platformName = dto.platforms[i];
  if (result.status === 'fulfilled') {
    return { platform: platformName, data: result.value, isFallback: false };
  }
  // partial failure: reconstruct from canonical concept
  return {
    platform: platformName,
    data: this.reconstructFromConcept(platformName, concept),
    isFallback: true,
    error: result.reason?.message,
  };
});
```

**Why Promise.allSettled over Promise.all:**
- `Promise.all` short-circuits on first rejection — one bad platform kills the entire request.
- `Promise.allSettled` collects all outcomes; the service decides what to do with failures.

**Partial failure contract:**
- Any processor that throws is reconstructed from `MusicConcept` fields (no second LLM call).
- The response includes all requested platforms; failed ones are flagged with `isFallback: true`.
- This matches the PROJECT.md requirement: "remaining platforms return normally and the failed platform is reconstructed from MusicConcept."

**Processor timeout:** Add a `Promise.race` per processor with a timeout guard if individual processors can hang (external LLM calls inside processors would be an anti-pattern — processors should be pure transforms of MusicConcept).

**Confidence:** HIGH — Promise.allSettled is standard JS/TS; pattern is well-established

---

### Decision 5: Redis Caching — CacheModule + Keyv + Cache Key Strategy

**Module setup:**

```typescript
// app.module.ts
CacheModule.registerAsync({
  isGlobal: true,
  useFactory: async () => ({
    stores: [
      new Keyv({ store: new KeyvRedis(process.env.REDIS_URL) }),
    ],
    ttl: 3600_000, // 1 hour default, in ms
  }),
})
```

**Cache key strategy:**

```typescript
import { createHash } from 'crypto';

function buildCacheKey(prompt: string, platforms: string[]): string {
  const sorted = [...platforms].sort().join(',');
  const payload = `${prompt}::${sorted}`;
  return `metagen:gen:${createHash('sha256').update(payload).digest('hex')}`;
}
```

**Why this key design:**
- Sorting platforms before hashing ensures `['spotify','youtube']` and `['youtube','spotify']` produce the same key — identical semantic requests hit the same cache entry.
- SHA-256 provides a fixed-length, collision-resistant key regardless of prompt length.
- Namespaced prefix (`metagen:gen:`) allows selective cache flushing if needed.

**Cache invalidation strategy:** TTL-based expiry only. This content is generative — there is no "source data changed" event to trigger invalidation. A 1-hour TTL is a reasonable default; make it configurable via `ConfigService`.

**What NOT to cache:** Do not cache at the HTTP interceptor level (`@UseInterceptors(CacheInterceptor)`) — the cache key computation requires sorted platform normalization which the HTTP interceptor cannot handle automatically. Cache manually inside `GenerationService`.

**Confidence:** HIGH for the key design and TTL approach; MEDIUM for the exact `@nestjs/cache-manager` + Keyv/Redis integration (cache-manager v5 switched to Keyv; verify package versions match `nestjs/docs.nestjs.com` source)

---

### Decision 6: NestJS + Prisma Service Layer

**Recommended approach:** Use `nestjs-prisma` library's `PrismaModule.forRoot({ isGlobal: true })` rather than manually bootstrapping `PrismaClient`.

```typescript
// app.module.ts
PrismaModule.forRoot({ isGlobal: true })

// persistence.service.ts
@Injectable()
export class PersistenceService {
  constructor(private prisma: PrismaService) {}

  async saveGenerationRequest(prompt: string, platforms: string[]) {
    return this.prisma.generationRequest.create({
      data: { prompt, platforms }
    });
  }

  async saveResults(requestId: string, results: PlatformResult[]) {
    return this.prisma.generationResult.createMany({
      data: results.map(r => ({
        requestId,
        platform: r.platform,
        outputJson: r.data,
        isFallback: r.isFallback,
      }))
    });
  }

  async findHistory(platform?: string, page = 1, limit = 20) {
    return this.prisma.generationRequest.findMany({
      where: platform ? {
        results: { some: { platform } }
      } : undefined,
      include: { results: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }
}
```

**Two-table schema implications:**
- `generation_requests`: id, prompt, platforms[], created_at
- `generation_results`: id, request_id (FK), platform, output_json, is_fallback, created_at
- Separate tables enable cheap `WHERE platform = 'spotify'` filtering on results without scanning prompt data.
- `outputJson` stored as JSON column — avoids schema churn as platform output shapes evolve.

**Confidence:** HIGH — nestjs-prisma docs confirm isGlobal pattern; PrismaService is directly injectable once module is global

---

### Decision 7: Rate Limiting — ThrottlerModule with Redis Storage

**Setup:**

```typescript
// app.module.ts
ThrottlerModule.forRoot({
  throttlers: [{ ttl: 60_000, limit: 3 }],
  storage: new ThrottlerStorageRedisService(redisClient),
})
```

**Key points:**
- `@nestjs/throttler` provides `ThrottlerModule` with configurable TTL (ms) and limit.
- Default storage is in-memory — not suitable for Railway's potentially multi-instance deployment.
- Community package `nestjs-throttler-storage-redis` provides `ThrottlerStorageRedisService` implementing the `ThrottlerStorage` interface.
- Apply `ThrottlerGuard` globally via `APP_GUARD` provider or per-controller with `@UseGuards(ThrottlerGuard)`.
- Returns HTTP 429 automatically when limit is exceeded.

**Install:**

```bash
npm install @nestjs/throttler nestjs-throttler-storage-redis ioredis
```

**Confidence:** MEDIUM — ThrottlerModule + Redis storage community package is documented in official NestJS rate-limiting docs as the recommended approach for distributed environments; exact package name `nestjs-throttler-storage-redis` should be verified at install time

---

## Module Structure (NestJS)

```
AppModule
├── ConfigModule (global)
├── PrismaModule (global, isGlobal: true)
├── CacheModule (global, isGlobal: true, Redis via Keyv)
├── ThrottlerModule (global, Redis storage)
├── LLMModule
│   ├── providers: [OpenAIProvider, { provide: LLMProvider, useClass: OpenAIProvider }]
│   └── exports: [LLMProvider]
├── PlatformModule
│   ├── SpotifyModule (provides PLATFORM_PROCESSOR multi)
│   ├── TikTokModule  (provides PLATFORM_PROCESSOR multi)
│   ├── YouTubeModule (provides PLATFORM_PROCESSOR multi)
│   └── PlatformRegistry (injected with all PLATFORM_PROCESSOR instances)
├── GenerationModule
│   ├── GenerationController
│   ├── GenerationService
│   └── imports: [LLMModule, PlatformModule, CacheModule]
└── HistoryModule
    ├── HistoryController
    └── HistoryService (thin wrapper over PersistenceService)
```

---

## Patterns to Follow

### Pattern 1: Processor as Pure Transform

Each `PlatformProcessor.process()` takes a `MusicConcept` and returns deterministic output — no I/O, no LLM calls, no side effects. This makes processors trivially unit-testable and enables synchronous reconstruction in the fallback path.

### Pattern 2: Fail Fast in LLMService, Degrade Gracefully in Processors

`LLMService` should throw if the LLM call fails or if JSON parsing fails — this is a hard failure that should propagate to the client as a 5xx. Processor failures are soft failures handled by `Promise.allSettled` + fallback reconstruction.

### Pattern 3: Cache Key Before LLM Call

Always check and set cache at the `GenerationService` level, not at the controller or HTTP layer. The service has access to normalized inputs (sorted platforms) needed for deterministic key generation.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Per-Platform LLM Calls

Each processor calling LLM independently violates the canonical intermediary pattern. Consequences: N× cost, inconsistent outputs across platforms, broken fallback (no MusicConcept to reconstruct from), broken caching (cache key must cover all platforms as one unit).

### Anti-Pattern 2: Storing Platform Outputs in Separate Typed Columns

Avoid `spotify_title VARCHAR`, `spotify_mood VARCHAR`, etc. per column. Platform schemas will evolve; JSON column + Prisma Json type keeps the schema stable while preserving queryability.

### Anti-Pattern 3: Registering Processors in PlatformRegistry Manually

```typescript
// Bad: violates open/closed
constructor(
  private spotify: SpotifyProcessor,
  private tiktok: TikTokProcessor,
) {
  this.map.set('spotify', this.spotify);
  this.map.set('tiktok', this.tiktok);
}
```

Every new platform requires modifying `PlatformRegistry`. Use multi-provider injection instead.

### Anti-Pattern 4: Global HTTP Cache Interceptor for Generation Endpoint

`@UseInterceptors(CacheInterceptor)` uses the request URL as the cache key. POST bodies are not included. Manually computing `hash(prompt + sortedPlatforms)` inside `GenerationService` is the only correct approach.

---

## Suggested Build Order

This ordering respects component dependencies — each step's dependencies are already in place.

| Step | Component | Depends On | Rationale |
|------|-----------|------------|-----------|
| 1 | `PrismaModule` + schema + migrations | Nothing | Foundation; all persistence depends on it |
| 2 | `LLMProvider` interface + `OpenAIProvider` | `ConfigModule` | Core data producer; unblocks LLMService |
| 3 | `MusicConcept` type + `LLMService` | `LLMProvider` | Canonical intermediary shape must be defined before processors |
| 4 | `PlatformProcessor` interface + `SpotifyProcessor`, `TikTokProcessor`, `YouTubeProcessor` | `MusicConcept` type | Processors depend on the canonical type, not on LLM |
| 5 | `PlatformRegistry` + `PlatformModule` | Processors, multi-provider token | Can be wired only after processors exist |
| 6 | `CacheService` wrapper | `CacheModule` (Redis) | Cache used by GenerationService |
| 7 | `GenerationService` + `GenerationController` | Steps 2–6 | Orchestrator; builds on all prior components |
| 8 | `PersistenceService` + history query | `PrismaService` (step 1) | Persistence after generation pipeline works |
| 9 | `HistoryController` | `PersistenceService` | Thin read layer on top of persistence |
| 10 | `ThrottlerModule` with Redis storage | `GenerationController` exists | Rate limiting applied last; behavior testable independently |

---

## Scalability Considerations

| Concern | At current scale (single Railway instance) | Future scale |
|---------|---------------------------------------------|--------------|
| LLM cost | 1 call per cache miss — Redis caching critical | Consider per-MusicConcept cache (step 3 only) to reuse concept across platform subsets |
| Processor execution | Promise.allSettled in-process is sufficient | Move to BullMQ job queue if processors become slow or unreliable |
| Rate limiting | Redis-backed ThrottlerModule survives Railway restarts and scales to multiple instances | No change needed |
| Cache storage | Single Redis instance on Railway — adequate | Add read replica if cache becomes bottleneck |
| DB reads | Pagination on GET /history prevents full scans | Add composite index on (platform, created_at) when history grows |

---

## Sources

- NestJS custom providers, multi:true, useClass: https://github.com/nestjs/docs.nestjs.com/blob/master/content/fundamentals/dependency-injection.md (HIGH confidence)
- NestJS ConfigurableModuleBuilder / dynamic modules: https://github.com/nestjs/docs.nestjs.com/blob/master/content/fundamentals/dynamic-modules.md (HIGH confidence)
- NestJS ThrottlerModule + storage interface: https://github.com/nestjs/docs.nestjs.com/blob/master/content/security/rate-limiting.md (HIGH confidence)
- NestJS CacheModule + Keyv/Redis: https://github.com/nestjs/docs.nestjs.com/blob/master/content/techniques/caching.md (HIGH confidence)
- nestjs-prisma PrismaModule.forRoot isGlobal: https://github.com/notiz-dev/nestjs-prisma/blob/main/docs/src/content/docs/configuration.md (HIGH confidence)
- NestJS OnModuleInit + ModuleRef: https://github.com/nestjs/docs.nestjs.com/blob/master/content/fundamentals/lifecycle-events.md (HIGH confidence)
