import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';

// D-12: Redis-backed cache via @keyv/redis (separate from throttler's ioredis connection)
// D-13: Uses REDIS_URL env var
// D-14: 1 hour TTL (3_600_000ms)
// Phase 2 GenerationService injects CACHE_MANAGER to read/write generation cache manually
@Module({
  imports: [
    NestCacheModule.registerAsync({
      isGlobal: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useFactory: (): any => ({
        store: new KeyvRedis(process.env['REDIS_URL'] as string),
        ttl: 3_600_000, // D-14: 1 hour TTL in milliseconds
      }),
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
