# Domain Pitfalls

**Domain:** AI music content generation pipeline (NestJS + OpenAI + Prisma + Redis + Next.js App Router)
**Researched:** 2026-06-02
**Sources:** OpenAI Node SDK docs (Context7 /openai/openai-node), NestJS docs (Context7 /nestjs/docs.nestjs.com), NestJS Throttler docs (Context7 /nestjs/throttler), Prisma docs (Context7 /websites/prisma_io), TanStack Query docs (Context7 /tanstack/query), ioredis docs (Context7 /redis/ioredis)

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or complete production failures.

---

### Pitfall 1: Using `json_object` Mode Instead of Structured Outputs for MusicConcept

**What goes wrong:** The OpenAI `response_format: { type: "json_object" }` mode only guarantees syntactically valid JSON — it does not constrain the shape. The model will generate any object it chooses. For a `MusicConcept` with fields like `bpm: number`, `genre: string`, `mood: string[]`, the model may return `bpm: "120"` (string instead of number), omit required fields, or invent fields entirely. TypeScript types do not protect you at runtime — the cast `as MusicConcept` silently hides the mismatch until a downstream processor crashes.

**Why it happens:** Developers assume TypeScript types enforce runtime behavior. `json_object` mode is strictly a syntax guarantee, not a schema guarantee.

**Consequences:** Processors receive malformed `MusicConcept` objects; `bpm` arithmetic fails at runtime; genre arrays are sometimes strings; description field is missing. These bugs appear intermittently (model-temperature-dependent) and are hard to reproduce.

**Prevention:**
- Use `client.chat.completions.parse()` with `zodResponseFormat(MusicConceptSchema, "music_concept")` — this compiles the Zod schema to a JSON Schema sent to the model, enforcing shape server-side.
- Requires model `gpt-4o-2024-08-06` or later; structured outputs are NOT available on `gpt-3.5-turbo` or older gpt-4 variants.
- After parsing, always check `message.parsed` — if `null`, the model issued a refusal (content policy) and `message.refusal` contains the reason.
- Define explicit numeric constraints in the Zod schema: `bpm: z.number().int().min(60).max(220)`.

**Detection warning signs:**
- Downstream processors throwing `TypeError: Cannot read properties of undefined` for known fields.
- BPM values appearing as strings in logs.
- Intermittent failures that are never reproducible on the second attempt.

**Phase:** Address in Phase 1 (LLM integration), before any processor is built.

---

### Pitfall 2: Structured Output Refusals Crash the Generation Pipeline

**What goes wrong:** OpenAI's structured output endpoint can return a refusal (`finish_reason: "refusal"`) when the prompt touches music content the model flags as problematic (e.g., prompts containing artist names, explicit themes, or terms associated with copyright violations). When using `client.chat.completions.parse()`, `message.parsed` is `null` and `message.refusal` is a string. Code that accesses `message.parsed.title` throws immediately.

**Why it happens:** The `.parse()` helper does not throw on refusal — it returns a valid response object with `parsed: null`. The pattern `const concept = completion.choices[0].message.parsed!` with a non-null assertion is the primary source of crashes.

**Consequences:** Unhandled null dereference crashes the entire generation request; no platform output is returned; the error appears as a 500 rather than an intelligible user message.

**Prevention:**
```typescript
const message = completion.choices[0]?.message;
if (message?.refusal) {
  throw new BadRequestException(`LLM refused to generate: ${message.refusal}`);
}
if (!message?.parsed) {
  throw new InternalServerErrorException('LLM returned no parsed output');
}
const concept: MusicConcept = message.parsed;
```

**Detection warning signs:** Production 500 errors with stack traces pointing into structured output accessor code. Music prompts containing "Taylor Swift" or explicit song titles will reliably trigger this.

**Phase:** Address in Phase 1 (LLM integration).

---

### Pitfall 3: Hallucinated Enumerations in Music Metadata

**What goes wrong:** Even with Structured Outputs, the model will produce values that are technically valid strings but semantically wrong for music distribution. Genre values like `"Synthwave-adjacent"`, `"Lo-Fi Hip-Hop Chill"`, or `"Trap/EDM Fusion"` are not Spotify genre taxonomy entries. Mood values like `"Introspective but upbeat"` are not valid TikTok mood tags. BPM of 340 is structurally valid (an integer) but musically nonsensical.

**Why it happens:** The LLM optimizes for linguistic plausibility, not domain-specific enumeration compliance. The Zod schema enforces type but not semantic validity unless you add `.enum()` or `.refine()` constraints.

**Consequences:** SpotifyProcessor emits genres that Spotify's API rejects; TikTok content fails hashtag validation; downstream analytics are meaningless.

**Prevention:**
- Add explicit Zod `.enum([...])` for genre and mood using a curated list of valid values (even if imperfect, reduces the hallucination surface dramatically).
- Add `.min(60).max(220)` constraint on BPM.
- Include few-shot examples in the system prompt showing valid genre/mood values.
- Add a post-parse validation step using `MusicConceptSchema.safeParse(parsed)` even after structured output, because numeric range constraints are not enforced by OpenAI's JSON schema conversion (only type is enforced server-side; `minimum`/`maximum` are client-side Zod runtime checks).

**Detection warning signs:** Genre values with slashes, hyphens, or parenthetical qualifiers. BPM values outside the 60-220 range. Mood values longer than 20 characters.

**Phase:** Address in Phase 1 (prompt engineering), revisit in Phase 2 (processor implementation).

---

### Pitfall 4: `Promise.allSettled` vs `Promise.all` for Parallel Platform Processing

**What goes wrong:** Using `Promise.all` for the parallel platform processor execution causes a single processor failure to reject the entire generation request. The project requirement explicitly states that if one platform fails, the others should succeed and the failed one should fall back to MusicConcept reconstruction. `Promise.all` does not support this — it rejects on first rejection.

**Why it happens:** `Promise.all` is more commonly known and is the natural choice when developers want parallel execution. The partial-failure semantics of `Promise.allSettled` are underused.

**Consequences:** If TikTokProcessor throws (network blip, rate limit), the Spotify and YouTube results are discarded. The user gets a 500 instead of two successful results plus one fallback.

**Prevention:**
```typescript
const results = await Promise.allSettled(
  platforms.map(p => this.registry.get(p).process(musicConcept))
);
return results.map((result, i) => {
  if (result.status === 'fulfilled') return result.value;
  return this.buildFallback(platforms[i], musicConcept, result.reason);
});
```
The fallback reconstructs the platform output directly from `MusicConcept` fields without calling the LLM again, and marks the result with `isFallback: true`.

**Detection warning signs:** Any single-processor test failure causes all other processor tests to fail in integration tests. Log shows all-or-nothing pattern in production.

**Phase:** Address in Phase 1 (generation service orchestration).

---

### Pitfall 5: Redis Cache Stampede on Identical Concurrent Requests

**What goes wrong:** Multiple clients submit the same prompt+platforms combination simultaneously. All requests check the Redis cache, find a miss (the first request hasn't completed yet), and each fires an independent LLM call. With a 3 req/min rate limit this can exhaust the quota in one second; with no rate limit it wastes money.

**Why it happens:** Standard cache-aside pattern (check → miss → compute → write) has a race window between the miss check and the write. Concurrent requests all pass through the miss window.

**Consequences:** 3–10x the intended LLM calls on popular prompts; OpenAI `RateLimitError` (429) propagates to users; costs multiply unexpectedly.

**Prevention:**
- Use Redis `SET NX PX` (set-if-not-exists with expiry) to lock the computation key before calling the LLM. Other requests that encounter the lock should wait with a short poll (or return a 202 Accepted with a retry hint).
- Alternatively, deduplicate in-flight requests at the application layer using a `Map<string, Promise<Result>>` keyed by cache hash — all concurrent requests for the same hash await the same Promise.
- The in-process deduplication map is simpler and appropriate for a single-instance Railway deployment; Redis locking is needed if the service is ever horizontally scaled.

**Detection warning signs:** OpenAI billing showing bursts of identical prompts. Log timestamps showing multiple LLM calls with the same cache key within milliseconds of each other.

**Phase:** Address in Phase 1 (caching layer), flag for revisit if horizontal scaling is ever added.

---

### Pitfall 6: Railway Behind-Proxy IP for Rate Limiting

**What goes wrong:** The NestJS `@nestjs/throttler` guard by default tracks `req.ip`, which on Railway (and most PaaS/load balancers) is the internal proxy IP, not the client IP. Every request appears to come from `127.0.0.1`. The 3 req/min limit becomes a global 3 req/min limit across all clients simultaneously — the first 3 requests from any user block everyone.

**Why it happens:** Railway (like Heroku, Render, and similar platforms) terminates TLS at a load balancer and forwards the real IP in `X-Forwarded-For`. Express/NestJS does not trust this header by default.

**Consequences:** All users are blocked after the first 3 requests total, not per user. The rate limiter is effectively broken in production.

**Prevention:**
1. Enable Express trust proxy in NestJS bootstrap: `app.set('trust proxy', 1)` or `app.getHttpAdapter().getInstance().set('trust proxy', 1)`.
2. Extend `ThrottlerGuard` to extract IP from `req.ips`:
```typescript
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const tracker = req.ips.length > 0 ? req.ips[0] : req.ip;
    return Promise.resolve(tracker);
  }
}
```
3. Use Redis-backed throttler storage (`@nest-lab/throttler-storage-redis`) so rate limit state survives restarts.

**Detection warning signs:** Rate limit errors appearing immediately in production but never in local testing. All users getting 429 simultaneously.

**Phase:** Address in Phase 1 (NestJS configuration), critical to verify before any production deployment.

---

## Moderate Pitfalls

Mistakes that cause subtle bugs, performance degradation, or bad user experience.

---

### Pitfall 7: Prisma PrismaClient Instantiation in NestJS Without Singleton

**What goes wrong:** Creating `new PrismaClient()` inside the constructor of a NestJS service (rather than as a singleton provider) creates a new connection pool per service instantiation. In NestJS's DI system, request-scoped providers would create a new PrismaClient per request, exhausting PostgreSQL's connection limit (Railway PostgreSQL defaults to 100 connections).

**Why it happens:** NestJS's `@Injectable()` decorator encourages instantiating dependencies in the constructor. Developers unfamiliar with Prisma's connection model assume it behaves like a stateless HTTP client.

**Prevention:**
- Create a single `PrismaService` that extends `PrismaClient` and is registered as a module-level singleton (default NestJS scope).
- In NestJS the correct pattern is:
```typescript
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```
- Register `PrismaService` in the module providers array and inject it — never instantiate directly.

**Detection warning signs:** PostgreSQL error "too many connections" after load testing. Connection count in pg_stat_activity growing without bound.

**Phase:** Address in Phase 1 (database layer setup).

---

### Pitfall 8: N+1 Query in the History Endpoint

**What goes wrong:** The `GET /history` endpoint returns `generation_requests` with their associated `generation_results`. A naive implementation fetches all requests, then fetches results for each request in a loop:
```typescript
const requests = await prisma.generationRequest.findMany(/* pagination */);
const withResults = await Promise.all(
  requests.map(r => prisma.generationResult.findMany({ where: { requestId: r.id } }))
);
```
This generates 1 + N queries for a page of N requests.

**Prevention:**
```typescript
const requests = await prisma.generationRequest.findMany({
  include: { generationResults: true },
  orderBy: { createdAt: 'desc' },
  skip, take,
  where: platform ? { generationResults: { some: { platform } } } : undefined,
});
```
The `include` approach generates exactly 2 queries (one for requests, one batch for results). For read-heavy workloads, `relationLoadStrategy: "join"` reduces this to 1 query at the cost of larger result rows.

**Detection warning signs:** History endpoint latency scales linearly with page size. Query logs showing repeated `SELECT * FROM generation_results WHERE requestId = ?`.

**Phase:** Address in Phase 2 (history endpoint implementation).

---

### Pitfall 9: Missing `prisma migrate deploy` in Railway Startup Command

**What goes wrong:** Railway runs the service's start command directly (`node dist/main.js`). If the start command does not include `prisma migrate deploy`, schema changes deployed via code changes will not be applied to the production database. The application starts against a stale schema, causing Prisma query errors on new fields.

**Why it happens:** Developers run `prisma migrate dev` locally (which auto-applies migrations) and forget that production requires an explicit `prisma migrate deploy`.

**Consequences:** New enum values throw Prisma enum validation errors; new required columns cause insert failures; these errors only appear in production, not in local dev.

**Prevention:**
- Set Railway's start command to: `npx prisma migrate deploy && node dist/main.js`
- Or use a Railway build command separate from start command to run migrations pre-boot.
- Never use `prisma migrate dev` or `prisma db push` in production — `migrate deploy` is the only safe production command.

**Detection warning signs:** "Column does not exist" Prisma errors immediately after deployment. Schema changes work locally but fail in production.

**Phase:** Address in Phase 1 (deployment configuration), before any database schema changes are deployed.

---

### Pitfall 10: OpenAI Default Timeout is 10 Minutes — NestJS will Time Out First

**What goes wrong:** The OpenAI Node SDK's default request timeout is 10 minutes (`timeout: 600_000`). NestJS HTTP requests (via the RxJS-based `TimeoutInterceptor`) typically default to 5 seconds or whatever the HTTP client timeout is. An LLM call generating a `MusicConcept` can take 10–30 seconds for a complex prompt. The HTTP layer will return a 408 or connection reset to the frontend before the LLM call completes.

**Why it happens:** The OpenAI SDK and the NestJS HTTP layer have independent timeout configurations that developers configure independently (or forget to configure).

**Consequences:** Frontend shows an error/timeout while the backend LLM call is still in-flight. The LLM call completes, but the response is dropped. If results were already persisted, the frontend never shows them. If not yet persisted, the generation is lost.

**Prevention:**
- Set OpenAI client timeout to a deliberate value: `timeout: 30_000` (30s covers most MusicConcept generations).
- Configure NestJS `TimeoutInterceptor` to allow at least 45 seconds for the generation endpoint specifically (higher than the LLM timeout to ensure LLM failure surfaces cleanly).
- Do NOT set a global short timeout and selectively override — it's easier to apply the `TimeoutInterceptor` only where needed rather than globally.

**Detection warning signs:** Frontend shows timeout errors; backend logs show the LLM call completing successfully 2-5 seconds after the HTTP response was already sent.

**Phase:** Address in Phase 1 (LLM service integration and NestJS bootstrapping).

---

### Pitfall 11: OpenAI Auto-Retry Masks Rate Limit Errors With Delay

**What goes wrong:** The OpenAI Node SDK automatically retries 429 (rate limit), 408, 409, and >=500 errors with exponential backoff, up to `maxRetries: 2` by default. For a generation endpoint already taking 10–30 seconds, a retry adds another 10–30 seconds — the total latency can reach 90+ seconds. The frontend timeout fires while the SDK is silently retrying.

**Why it happens:** Developers configure `maxRetries` without accounting for the multiplicative effect on worst-case latency.

**Consequences:** Silent 90-second hangs that appear as frontend timeouts. Rate limit events are invisible in application logs because the SDK absorbs them.

**Prevention:**
- Set `maxRetries: 0` on the LLM call itself and implement retries explicitly with `p-retry` or a custom backoff that logs each attempt and respects the overall request timeout budget.
- Alternatively, keep `maxRetries: 1` (one retry) but set the per-request `timeout` tightly enough that 2 retries stay within the frontend's acceptable wait window.
- Always log `RateLimitError` catches explicitly so they surface in monitoring.

**Detection warning signs:** P95 latency on the generation endpoint being 3–4x higher than P50. No 429 errors in logs even when OpenAI dashboard shows rate limit events.

**Phase:** Address in Phase 1 (LLM provider implementation).

---

### Pitfall 12: TanStack Query `useMutation` Retrying a Non-Idempotent Generation

**What goes wrong:** TanStack Query's `useMutation` has no automatic retry by default, but developers adding `retry: 3` (copied from `useQuery` patterns) will cause a failed generation to fire 3 additional LLM calls, each creating a new database record. For a 3 req/min rate limit, this can exhaust the limit from a single user error.

A separate related issue: if the mutation succeeds but the network response is dropped (browser goes offline for 100ms after the POST), TanStack Query marks the mutation as failed. On retry, a duplicate generation is created with a new ID — the user gets duplicate history entries.

**Why it happens:** `useQuery` has safe automatic retry because queries are idempotent. Developers apply the same retry reasoning to mutations.

**Prevention:**
- Keep `retry: false` (default) for the generation `useMutation`.
- Handle the duplicate-on-network-drop risk by generating a client-side idempotency key (UUID) on each form submit and sending it as a request header. The backend checks the key in Redis before processing: if already seen, return the cached result.
- Use `mutationKey` in TanStack Query to allow manual retry from the UI (retry button) rather than automatic retry.

**Detection warning signs:** History view showing duplicate entries for the same prompt within seconds of each other. Rate limit errors appearing from single-user sessions.

**Phase:** Address in Phase 3 (frontend integration).

---

### Pitfall 13: TanStack Query `useQuery` Refetching History on Window Focus

**What goes wrong:** TanStack Query's `useQuery` by default refetches data when the browser window regains focus (`refetchOnWindowFocus: true`). For a history list that doesn't change frequently, this fires a `GET /history` database query every time the user alt-tabs back to the app. With pagination and platform filtering, these are moderately expensive queries.

**Prevention:**
- Set `staleTime: 60_000` (1 minute) on the history query. Data will not be refetched on focus unless it has been stale for over 1 minute.
- Set `refetchOnWindowFocus: false` on the history query if real-time freshness is not required.
- After a successful generation mutation, explicitly invalidate the history query key with `queryClient.invalidateQueries({ queryKey: ['history'] })` to force a fresh fetch at the right moment.

**Detection warning signs:** Network tab showing `GET /history` requests firing every time the user switches windows. Database query logs showing frequent identical history queries.

**Phase:** Address in Phase 3 (frontend integration).

---

## Minor Pitfalls

Nuisances that don't cause failures but create friction, subtle bugs, or maintenance problems.

---

### Pitfall 14: Redis `enableOfflineQueue: true` Hides Connection Failures

**What goes wrong:** ioredis by default queues commands when the connection is down (`enableOfflineQueue: true`). If Redis is unreachable on Railway startup, cache `GET` commands queue indefinitely rather than failing fast. The generation endpoint hangs waiting for Redis to respond, which appears as a timeout instead of a cache bypass.

**Prevention:**
- Set `enableOfflineQueue: false` for the cache client. On connection failure, commands throw immediately and the application logic falls through to the LLM (cache miss path).
- Wrap all Redis operations in try/catch and treat any Redis error as a cache miss — the LLM call should always be the fallback, never blocked by Redis.
- Attach an `error` handler to the ioredis instance: without it, unhandled Redis errors crash the Node.js process (`EventEmitter` unhandled error behavior).

**Detection warning signs:** Generation endpoint hanging indefinitely on Redis restart. No Redis error in logs despite Redis being unreachable.

**Phase:** Address in Phase 1 (caching layer setup).

---

### Pitfall 15: `prisma generate` Not Running as Part of Railway Build

**What goes wrong:** Prisma requires `prisma generate` to produce the TypeScript client from the schema before the application can import `@prisma/client`. Locally this is part of the dev workflow, but on Railway the build command must explicitly include it. If `prisma generate` is not run during the Docker/build step, the Railway deployment fails with `Cannot find module '.prisma/client'`.

**Prevention:**
- Add to `package.json` scripts: `"postinstall": "prisma generate"`. Railway runs `npm install` and `postinstall` fires automatically during build.
- Build command: `npm ci && npx prisma generate && npm run build`
- Start command: `npx prisma migrate deploy && node dist/main.js`

**Detection warning signs:** Railway build succeeds but runtime crashes with module-not-found on `@prisma/client`. Works locally, fails on Railway.

**Phase:** Address in Phase 1 (deployment configuration).

---

### Pitfall 16: NestJS Throttler Default In-Memory Storage Does Not Survive Restarts

**What goes wrong:** The default `@nestjs/throttler` storage is in-memory. When Railway restarts the service (deployment, crash, scale event), all rate limit counters reset. A user can exploit this to exceed the 3 req/min limit by watching for deploys, or rate limit windows can become inconsistent across multiple instances.

**Prevention:**
- Use `@nest-lab/throttler-storage-redis` to store throttle state in Redis.
- This also ensures correct behavior if Railway ever scales the NestJS service horizontally.
- The Redis client used for throttle storage should be a separate connection from the cache client (different logical DB or key-prefix) to prevent namespace collisions.

**Detection warning signs:** Rate limit not enforced immediately after service restart. Rate limit tests passing locally but failing intermittently in production.

**Phase:** Address in Phase 1 (NestJS rate limiting setup).

---

### Pitfall 17: CORS Not Configured for Railway Frontend URL

**What goes wrong:** Railway assigns dynamic subdomains to each service (e.g., `melotech-api-production.up.railway.app`). The NestJS backend must be configured to allow CORS from the Next.js frontend domain. `app.enableCors()` with no configuration allows all origins — this works but is insecure. Conversely, hardcoding the CORS origin fails in preview environments with different domains.

**Prevention:**
- Use `app.enableCors({ origin: process.env.FRONTEND_URL })` where `FRONTEND_URL` is an environment variable set in Railway.
- In development, `FRONTEND_URL=http://localhost:3000`.
- Support multiple origins (comma-separated) if preview environments are used.

**Detection warning signs:** CORS errors in the browser console after Railway deployment. Frontend works locally but fails in production.

**Phase:** Address in Phase 1 (NestJS bootstrap configuration).

---

### Pitfall 18: Zod Schema Incompatibility with OpenAI Structured Outputs Constraints

**What goes wrong:** OpenAI's structured outputs endpoint does not support all JSON Schema features. Specifically: `additionalProperties` must be `false` on all objects; all properties must be in the `required` array (no optional properties); certain Zod features like `.optional()` on nested objects are transformed by `zodResponseFormat` in ways that may not map cleanly.

**Why it happens:** Zod's schema → JSON Schema → OpenAI's restricted JSON Schema subset is a lossy transformation. `zodResponseFormat` handles most cases but edge cases exist for deeply nested optional fields.

**Prevention:**
- Keep the `MusicConceptSchema` flat and explicit: all fields required, no optional nested objects.
- Use `z.nullable()` instead of `z.optional()` for fields that can be absent — OpenAI's schema supports `null` as a type union.
- Test the full schema serialization by inspecting what `zodResponseFormat` produces before sending it to the API.

**Detection warning signs:** API returning `invalid_request_error` with messages about unsupported JSON schema features. Schema works in unit tests but fails when sent to OpenAI.

**Phase:** Address in Phase 1 (LLM schema definition).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| LLM provider module | Structured outputs only on gpt-4o-2024-08-06+ | Pin model version in config, document constraint |
| LLM provider module | Refusal returns `parsed: null` — crashes on `!` assertion | Always guard `message.refusal` before accessing `message.parsed` |
| MusicConcept generation | Enum hallucinations pass Zod type check | Add `.enum([...])` for genre/mood; `.min()/.max()` for BPM |
| Platform registry execution | `Promise.all` discards partial results | Use `Promise.allSettled` unconditionally |
| Caching layer | Cache miss race causes stampede | In-process deduplication map keyed by cache hash |
| NestJS bootstrapping | Proxy IP breaks per-user rate limiting on Railway | `trust proxy` + custom `ThrottlerGuard.getTracker()` |
| Throttler storage | In-memory state lost on restart | Redis-backed throttler storage |
| Prisma setup | Multiple `PrismaClient` instances exhaust connections | Singleton `PrismaService` registered in module providers |
| History endpoint | Loop over results creates N+1 queries | `include: { generationResults: true }` in single findMany |
| Railway deployment | Missing `prisma generate` at build time | `postinstall` script in `package.json` |
| Railway deployment | Migrations not applied at startup | Start command: `prisma migrate deploy && node dist/main.js` |
| Railway deployment | CORS hardcoded domain fails in other environments | `FRONTEND_URL` env var for CORS origin |
| Frontend generation flow | TanStack mutation retries creating duplicate DB records | `retry: false` + server-side idempotency key |
| Frontend history view | `useQuery` refetches on every window focus | `staleTime: 60_000`, invalidate on mutation success |
| Redis connection | `enableOfflineQueue: true` hangs on Redis unavailability | `enableOfflineQueue: false` + error handler |
| Timeout coordination | OpenAI SDK default 10-min timeout outlasts HTTP layer | Explicit LLM timeout < HTTP interceptor timeout |
| OpenAI retries | Silent retries multiply P95 latency | `maxRetries: 0` on generation call, explicit retry logic |
