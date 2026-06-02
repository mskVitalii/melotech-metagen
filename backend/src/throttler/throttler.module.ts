import { Module } from '@nestjs/common';
import { ThrottlerModule as NestThrottlerModule } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

// D-12: Isolated ioredis client for throttler (separate from @keyv/redis cache client)
// D-13: Uses REDIS_URL env var
// D-15: ttl: 60_000ms, limit: 3 per IP per window
// D-17: getTracker inline — no class extension required in @nestjs/throttler v6
// Pitfall 7: enableOfflineQueue: false prevents silent hangs on Redis restart
const redisClient = new Redis(process.env.REDIS_URL as string, {
  enableOfflineQueue: false,
});

// Attach error handler to prevent unhandled EventEmitter crash on Redis connection failure
redisClient.on('error', (err: Error) => {
  console.error('[ThrottlerRedis] Connection error:', err.message);
});

@Module({
  imports: [
    NestThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 3 }],
      storage: new ThrottlerStorageRedisService(redisClient),
      // D-17: Extract real client IP behind Railway proxy (trust proxy: 1 set in main.ts)
      getTracker: (req: { ips?: string[]; ip?: string }) =>
        Promise.resolve(req.ips?.[0] ?? req.ip ?? ''),
    }),
  ],
  exports: [NestThrottlerModule],
})
export class ThrottlerModule {}
