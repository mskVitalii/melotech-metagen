---
slug: fix-throttler-redis-peer-dep
created: 2026-06-03
status: in-progress
---

# Fix throttler Redis peer dependency for NestJS v11

## Problem

`nestjs-throttler-storage-redis@0.5.1` declares peerDependency on `@nestjs/common ^7-10` only.
Project uses `@nestjs/common@11.1.24`. Railway Docker build fails with ERESOLVE during `npm ci`.

## Solution

Replace with `@nest-lab/throttler-storage-redis` which explicitly supports NestJS v7–v11
and exports the same `ThrottlerStorageRedisService` class — drop-in replacement.

## Tasks

- [ ] Update `backend/package.json`: remove `nestjs-throttler-storage-redis`, add `@nest-lab/throttler-storage-redis`
- [ ] Update import in `backend/src/throttler/throttler.module.ts`
- [ ] Run `npm install` in `backend/` to regenerate lockfile
- [ ] Commit
