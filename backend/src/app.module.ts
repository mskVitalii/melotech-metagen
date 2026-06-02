import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import { validate } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { RateProbeController } from './health/rate-probe.controller';
import { LLMModule } from './llm/llm.module';
import { ThrottlerModule } from './throttler/throttler.module';
import { CacheModule } from './cache/cache.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    PrismaModule,
    LLMModule,
    ThrottlerModule,
    CacheModule,
  ],
  controllers: [HealthController, RateProbeController],
  providers: [
    // RATE-01: Global rate limit guard — all routes protected by ThrottlerModule config
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
