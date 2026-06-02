---
slug: fix-throttler-redis-peer-dep
created: 2026-06-03
status: complete
---

# Fix throttler Redis peer dependency for NestJS v11

Replaced `nestjs-throttler-storage-redis@0.5.1` with `@nest-lab/throttler-storage-redis@1.2.0`.
Updated import in `backend/src/throttler/throttler.module.ts`.
Committed as `8befb8e`.
