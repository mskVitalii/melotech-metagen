# Technology Stack

**Project:** Melotech Metagen
**Researched:** 2026-06-02
**Confidence:** HIGH (all major choices verified against official docs and published package versions)

---

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

---

## Key Patterns

### PrismaService (Prisma 7 + NestJS 11)

```typescript
// src/prisma/prisma.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL as string,
    });
    super({ adapter });
  }
}
```

Note: No `onModuleInit` + `$connect()` and no custom `enableShutdownHooks` needed in Prisma 5+. Prisma handles connection pooling automatically. Use `app.enableShutdownHooks()` in main.ts for graceful shutdown.

```typescript
// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()  // mark global so PrismaService is available everywhere without re-importing PrismaModule
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### Redis Caching (application-layer request cache)

```typescript
// app.module.ts
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';

CacheModule.registerAsync({
  isGlobal: true,
  useFactory: async () => ({
    stores: [
      new Keyv({ store: new KeyvCacheableMemory({ ttl: 60000, lruSize: 1000 }) }),
      new KeyvRedis(process.env.REDIS_URL),
    ],
  }),
})
```

Two-store setup: memory L1 + Redis L2. Cache key = `hash(prompt + sortedPlatforms)`.

### Rate Limiting (Redis-backed, distributed)

```typescript
ThrottlerModule.forRoot({
  throttlers: [{ name: 'default', ttl: 60000, limit: 3 }],
  storage: new ThrottlerStorageRedisService(new Redis(process.env.REDIS_URL)),
})
```

Bind `ThrottlerGuard` globally via `APP_GUARD` provider.

### OpenAI Structured Output (LLMProvider implementation)

```typescript
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const MusicConceptSchema = z.object({
  title: z.string(),
  genre: z.string(),
  mood: z.string(),
  bpm: z.number(),
  instruments: z.array(z.string()),
  description: z.string(),
});

const completion = await this.openai.chat.completions.parse({
  model: 'gpt-4o-2024-08-06',  // minimum model supporting structured outputs
  messages: [...],
  response_format: zodResponseFormat(MusicConceptSchema, 'music_concept'),
});

const musicConcept = completion.choices[0].message.parsed;  // fully typed
```

Use `client.chat.completions.parse()` not `.create()` — the `.parse()` method automatically handles the `zodResponseFormat` conversion and returns a typed `parsed` field. Never call `.create()` with `response_format: { type: 'json_object' }` — that path requires manual JSON.parse and schema validation.

### TanStack Query v5 + Next.js App Router

Server Component (prefetch):
```tsx
// app/history/page.tsx
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';

export default function HistoryPage() {
  const queryClient = getQueryClient();
  queryClient.prefetchQuery({ queryKey: ['history'], queryFn: fetchHistory });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <HistoryList />
    </HydrationBoundary>
  );
}
```

Client Component (consume):
```tsx
'use client';
const { data } = useQuery({ queryKey: ['history'], queryFn: fetchHistory });
const mutation = useMutation({
  mutationFn: generateContent,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history'] }),
});
```

v5 breaking change: all options are passed as a single object. `useQuery(['key'], fn)` (v4 positional) is removed. All hooks use `{ queryKey, queryFn }` object syntax.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Redis client (caching) | @keyv/redis + @nestjs/cache-manager | raw ioredis | ioredis is fine but @nestjs/cache-manager provides DI integration, interceptor-based caching, and TTL management; avoids boilerplate |
| Redis client (throttler) | ioredis via nestjs-throttler-storage-redis | node-redis | nestjs-throttler-storage-redis explicitly supports both; ioredis has better cluster support and is more widely used in NestJS ecosystem |
| ORM | Prisma | TypeORM | TypeORM has inconsistent types with complex relations; Prisma's generated client is more predictable and its migrations are more reliable |
| Validation approach | class-validator + class-transformer | Zod for DTOs | NestJS ValidationPipe is built around class-validator; using Zod for DTOs requires custom pipes. Keep Zod for OpenAI schema definitions only; class-validator for HTTP DTOs |
| Config validation | Joi schema in ConfigModule | class-validator EnvironmentVariables class | Both work; Joi is lighter and purpose-built for env var schemas; class-validator requires extra boilerplate |
| LLM structured output | openai.chat.completions.parse + zodResponseFormat | Manual JSON mode | parse() is strictly safer — SDK validates the returned JSON matches the Zod schema and throws ParseError on failure; JSON mode requires manual parsing and error handling |

---

## Installation

```bash
# Backend (NestJS)
npm install @nestjs/common @nestjs/core @nestjs/platform-express
npm install @nestjs/config @nestjs/cache-manager @nestjs/throttler
npm install prisma @prisma/client @prisma/adapter-pg pg
npm install cache-manager @keyv/redis keyv cacheable
npm install nestjs-throttler-storage-redis ioredis
npm install openai zod
npm install class-validator class-transformer

# Dev dependencies (backend)
npm install -D @types/pg typescript ts-node

# Frontend (Next.js)
npm install @tanstack/react-query @tanstack/react-query-devtools
npm install tailwindcss @tailwindcss/vite  # Tailwind v4 CSS-first config
```

---

## What NOT to Use

- **cache-manager-redis-store**: deprecated, replaced by @keyv/redis in cache-manager v6+
- **@nestjs/redis / @liaoliaots/nestjs-redis**: third-party wrappers; the official @keyv/redis path is now recommended by NestJS docs
- **openai `response_format: { type: 'json_object' }`**: requires manual JSON.parse + manual Zod validation; use `.parse()` + `zodResponseFormat` instead
- **PrismaService with custom `enableShutdownHooks(app)` method**: removed in Prisma v5, replaced by `app.enableShutdownHooks()` in main.ts
- **TanStack Query positional API** (`useQuery(['key'], fn)`): removed in v5; use object syntax always
- **`@keyv/redis` alpha/next channel (6.x alpha)**: stick to 5.1.6 stable

---

## Sources

- NestJS Prisma recipe (official): https://docs.nestjs.com/recipes/prisma — HIGH confidence
- NestJS Caching docs (official): https://docs.nestjs.com/techniques/caching — HIGH confidence
- NestJS Throttler README (official): https://github.com/nestjs/throttler — HIGH confidence
- Prisma NestJS guide (official): https://www.prisma.io/docs/guides/frameworks/nestjs — HIGH confidence
- OpenAI Node SDK structured outputs: https://github.com/openai/openai-node/blob/master/helpers.md — HIGH confidence
- TanStack Query v5 SSR/App Router guide: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr — HIGH confidence
- Package versions verified via npm registry (2026-06-02)
