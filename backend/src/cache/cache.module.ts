import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';

// D-12: Dual-store cache — L1 in-memory (KeyvCacheableMemory) + L2 Redis (@keyv/redis)
//        @keyv/redis client is SEPARATE from the throttler's ioredis client (no shared connection)
// D-13: Uses REDIS_URL env var
// D-14: 1 hour TTL (3_600_000ms)
// Anti-Pattern guard: HTTP cache interceptor is NOT applied (POST body absent from interceptor cache key)
//                     Phase 2 GenerationService manages cache manually via CACHE_MANAGER token
@Module({
  imports: [
    NestCacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        stores: [
          // L1: In-memory cache — fastest reads, evicted when process restarts
          new Keyv({
            store: new KeyvCacheableMemory({ ttl: 60_000, lruSize: 1000 }),
          }),
          // L2: Redis cache — persistent across restarts, survives server restart
          new KeyvRedis(process.env.REDIS_URL as string),
        ],
        ttl: 3_600_000, // D-14: 1 hour default TTL in milliseconds
      }),
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
