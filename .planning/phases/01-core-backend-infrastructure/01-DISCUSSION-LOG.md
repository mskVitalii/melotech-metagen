# Phase 1: Core Backend Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 1-Core Backend Infrastructure
**Mode:** --auto (all decisions auto-selected via recommended defaults)
**Areas discussed:** Project Structure, LLM Integration, MusicConcept Zod Schema, Redis Dual-Client Setup, Railway Deployment Configuration

---

## Project Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Single monorepo (backend/ + frontend/) | Both services in one repo; Railway per-directory builds | ✓ |
| Separate repos | Backend and frontend in separate git repositories | |

**Auto-selected:** Single repo with `backend/` and `frontend/` top-level directories.
**Notes:** Railway supports per-directory builds with separate service configs. Simpler to manage for a two-service project.

---

## LLM Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Abstract class as DI token | Survives TypeScript compilation; injectable without @Inject() | ✓ |
| TypeScript interface | Erased at runtime; requires InjectionToken workaround | |
| zodResponseFormat + parse() | Enforces field types + required fields + ranges | ✓ |
| json_object mode | Only enforces valid JSON syntax, not schema | |
| gpt-4o-2024-08-06 | Minimum model for structured outputs | ✓ |

**Auto-selected:** Abstract class + zodResponseFormat + client.chat.completions.parse() + gpt-4o-2024-08-06.
**Notes:** Research confirmed json_object mode is a critical pitfall — does not enforce schema. Refusal guard (check parsed !== null) is mandatory.

---

## MusicConcept Zod Schema

| Option | Description | Selected |
|--------|-------------|----------|
| String types for genre/mood | Flexible; avoids enum hallucination | ✓ |
| Enum types for genre/mood | Constrains output; risk of unsupported values | |
| BPM as z.number().int().min(40).max(250) | Genre-range grounded; catches outliers | ✓ |
| BPM as z.number() | No bounds; allows implausible values | |

**Auto-selected:** Strings for genre/mood, bounded integer for BPM.
**Notes:** Research identified BPM hallucination as the most common trust-destroyer in music metadata generation. Enum types for genre risk hallucination when the model generates a valid-sounding but unlisted genre.

---

## Redis Dual-Client Setup

| Option | Description | Selected |
|--------|-------------|----------|
| Separate clients per concern | @keyv/redis for cache, ioredis for throttler | ✓ |
| Single shared Redis client | Simpler setup; risk of cross-concern interference | |

**Auto-selected:** Separate clients.
**Notes:** Research explicitly recommended not collapsing clients. CacheModule and ThrottlerModule have different connection/retry semantics.

---

## Railway Deployment Configuration

| Option | Description | Selected |
|--------|-------------|----------|
| postinstall: prisma generate; start: migrate deploy + node | Correct Railway deployment pattern | ✓ |
| Build step includes prisma generate | Fragile; depends on build tool ordering | |
| trust proxy + getTracker() override | Correct client IP for per-user rate limiting | ✓ |
| Default ThrottlerGuard (no trust proxy) | Rate limits entire deployment as one client | |

**Auto-selected:** postinstall for generate, migrate deploy in start command, trust proxy + tracker override.
**Notes:** Three Railway pitfalls flagged in PITFALLS.md as "always missed by first-timers". All addressed in D-16 through D-19.

---

## Claude's Discretion

- NestJS module file organization within `backend/src/`
- Whether to use `nestjs-prisma` library or manual `PrismaService`
- CORS configuration

## Deferred Ideas

- Spotify genre taxonomy enumeration (Phase 2)
- TikTok baseline hashtag list (Phase 2)
- Idempotency / duplicate request dedup (Phase 2)
- Subgenre field on MusicConcept (v2)
