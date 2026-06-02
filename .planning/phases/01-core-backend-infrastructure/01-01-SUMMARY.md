---
phase: 01-core-backend-infrastructure
plan: 01
subsystem: backend-scaffold
tags: [nestjs, prisma, zod, railway, scaffold]
dependency_graph:
  requires: []
  provides:
    - backend/prisma/schema.prisma
    - backend/src/config/env.validation.ts
    - backend/src/prisma/prisma.service.ts
    - backend/src/prisma/prisma.module.ts
    - backend/src/health/health.controller.ts
    - backend/src/main.ts
    - backend/src/app.module.ts
    - backend/railway.toml
    - PrismaService
    - PrismaModule
    - EnvConfig
    - validate()
    - HealthController
  affects:
    - backend/package.json
    - backend/tsconfig.json
    - .env.example
tech_stack:
  added:
    - NestJS 11 (nest new CLI scaffold)
    - "@nestjs/config@4.0.4"
    - "zod@4.4.3"
    - "prisma@7.8.0"
    - "@prisma/client@7.8.0"
    - "class-validator@0.15.1"
    - "class-transformer@0.5.1"
    - "dotenv@17.x (dev, required by prisma.config.ts)"
  patterns:
    - Zod env validation in ConfigModule.forRoot({ validate })
    - PrismaService extends generated PrismaClient (manual, no nestjs-prisma)
    - Express trust proxy set before app.listen()
    - prisma.config.ts for Prisma 7 datasource URL (breaking change from v6)
key_files:
  created:
    - backend/src/config/env.validation.ts
    - backend/src/prisma/prisma.service.ts
    - backend/src/prisma/prisma.module.ts
    - backend/src/health/health.controller.ts
    - backend/src/health/health.controller.spec.ts
    - backend/src/main.ts
    - backend/src/app.module.ts
    - backend/prisma/schema.prisma
    - backend/prisma.config.ts
    - backend/railway.toml
    - backend/.env.example
    - backend/.gitignore
    - .env.example
  modified: []
decisions:
  - "D-22: ConfigModule.forRoot({ isGlobal: true, validate }) wired with Zod EnvSchema"
  - "D-16: app.getHttpAdapter().getInstance().set('trust proxy', 1) before app.listen()"
  - "D-11: GenerationRequest and GenerationResult models with snake_case @map() table names"
  - "D-19: postinstall: prisma generate in package.json scripts"
  - "D-21: railway.toml at backend/railway.toml with migrate deploy in start command"
  - "Prisma 7 deviation: datasource url moved to prisma.config.ts (breaking change)"
  - "Manual PrismaService chosen over nestjs-prisma (zero extra dependency, Prisma 7 compatible)"
metrics:
  duration: ~25 minutes
  completed_date: "2026-06-02"
  tasks_completed: 2
  tasks_total: 3
  tasks_blocked: 1
---

# Phase 01 Plan 01: Backend Scaffold & Prisma Schema Summary

**One-liner:** NestJS 11 backend scaffolded with Prisma 7 schema (provider=prisma-client, output to src/generated/), fail-fast Zod env validation, trust proxy, HealthController, and Railway deploy config.

## What Was Built

### Task 1: NestJS scaffold + Zod env validation + main.ts

- Scaffolded `backend/` NestJS project using `npx @nestjs/cli@latest new backend --package-manager npm --skip-git`
- Installed runtime deps: `@nestjs/config`, `zod`, `class-validator`, `class-transformer`, `prisma`, `@prisma/client`
- Added `"postinstall": "prisma generate"` and `"engines": { "node": ">=22" }` to package.json (D-19)
- Created `backend/src/config/env.validation.ts` with Zod `EnvSchema` and `validate()` function (D-22, D-20):
  - Fields: `DATABASE_URL` (url), `REDIS_URL` (url), `OPENAI_API_KEY` (min 1), `OPENAI_MODEL` (default 'gpt-4o-2024-08-06'), `PORT` (coerce.number default 3001), `NODE_ENV` (enum default development), `FRONTEND_URL` (url optional)
  - Throws on `safeParse` failure with structured error listing each field
- Rewrote `backend/src/main.ts`: trust proxy (D-16), CORS, ValidationPipe, shutdownHooks, listen on PORT
- Wired `ConfigModule.forRoot({ isGlobal: true, validate })` in `app.module.ts` (D-22)
- Created `backend/.env.example` and root `.env.example` documenting all D-20 env vars
- Added `src/generated/` and `.env` to `backend/.gitignore` (RESEARCH Open Question 2)

**Commit:** `42a8e99`

### Task 2: Prisma schema + PrismaModule + HealthController + railway.toml

- Ran `npx prisma init --datasource-provider postgresql` to create initial schema and `prisma.config.ts`
- Wrote `backend/prisma/schema.prisma` per RESEARCH Pattern 2 (D-10, D-11):
  - `provider = "prisma-client"` (Prisma 7, NOT the legacy v6 provider)
  - `output = "../src/generated/prisma"` (required in Prisma 7)
  - `GenerationRequest` model with `@@map("generation_requests")`
  - `GenerationResult` model with `@@map("generation_results")`, `payload Json @map("payload_json")`
- Created `backend/src/prisma/prisma.service.ts`: `PrismaService extends PrismaClient` importing from `'../generated/prisma/client'` (custom output path)
- Created `backend/src/prisma/prisma.module.ts`: `@Global()` module exporting `PrismaService`
- Created `backend/src/health/health.controller.ts`: `GET /health` returning `{ status: 'ok', timestamp }`
- Created `backend/src/health/health.controller.spec.ts`: unit tests for health endpoint
- Updated `backend/src/app.module.ts`: imports `[ConfigModule, PrismaModule]`, controllers `[HealthController]`
- Created `backend/railway.toml` with `startCommand = "npx prisma migrate deploy && node dist/main.js"` (D-19, D-21)
- Ran `npx prisma generate` to produce client at `src/generated/prisma/` (gitignored)

**Commit:** `b760d19`

### Task 3: [BLOCKED] First Prisma migration

- **Status:** BLOCKED — requires live PostgreSQL database
- No `DATABASE_URL` in environment; local PostgreSQL not running
- Migration cannot run without a reachable PostgreSQL instance
- See checkpoint section below for user action required

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma 7 datasource URL not supported in schema.prisma**
- **Found during:** Task 2 (schema validation)
- **Issue:** Prisma 7 no longer supports `url = env("DATABASE_URL")` in the datasource block of `schema.prisma`. The error: `The datasource property url is no longer supported in schema files. Move connection URLs for Migrate to prisma.config.ts`
- **Fix:** Removed `url` from datasource block in `schema.prisma`. `prisma init` auto-generates `prisma.config.ts` with `datasource: { url: process.env["DATABASE_URL"] }` — this is the correct Prisma 7 approach.
- **Impact:** The research notes mention `provider = "prisma-client"` (Prisma 7 generator change) but did not capture the datasource URL change. `prisma.config.ts` was added as an additional file.
- **Files modified:** `backend/prisma/schema.prisma`, `backend/prisma.config.ts`
- **Commit:** `b760d19`

**2. [Rule 3 - Blocking] Missing dotenv for prisma.config.ts**
- **Found during:** Task 2
- **Issue:** `prisma.config.ts` uses `import "dotenv/config"` which requires `dotenv` package
- **Fix:** Installed `dotenv` as dev dependency
- **Files modified:** `backend/package.json`

## Known Stubs

None — all files wired to their actual dependencies. The health endpoint returns real data. Database connection is properly configured but not yet migrated (Task 3 blocked).

## Threat Surface Scan

No new threat surfaces beyond what the plan's threat model covers:
- T-01-01: DATABASE_URL protected by env-only injection via prisma.config.ts and NestJS ConfigModule — implemented
- T-01-02: Trust proxy implemented via `app.getHttpAdapter().getInstance().set('trust proxy', 1)` — implemented
- T-01-03: `DATABASE_URL` can include `?sslmode=require` — documented in `.env.example`

## Blocked Task: Task 3

**Task 3 requires user action before it can complete.**

See the CHECKPOINT section returned to the orchestrator.

## Self-Check: PASSED

- `42a8e99` exists: verified (`git log --oneline | grep 42a8e99`)
- `b760d19` exists: verified (`git log --oneline | grep b760d19`)
- `backend/prisma/schema.prisma` exists: verified
- `backend/src/config/env.validation.ts` exists: verified
- `backend/src/prisma/prisma.service.ts` exists: verified
- `backend/src/health/health.controller.ts` exists: verified
- `backend/railway.toml` exists: verified
- `backend/src/main.ts` contains "trust proxy": verified
- `npx prisma validate` passes: verified
- `npm run build` exits 0: verified
