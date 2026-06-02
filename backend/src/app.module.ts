import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import { validate } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthController } from './health/health.controller.js';
import { RateProbeController } from './health/rate-probe.controller.js';
import { LLMModule } from './llm/llm.module.js';
import { ThrottlerModule } from './throttler/throttler.module.js';
import { CacheModule } from './cache/cache.module.js';
import { GenerationModule } from './generation/generation.module.js';

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
    // D-21: GenerationModule registered in AppModule (API-01)
    GenerationModule,
  ],
  controllers: [HealthController, RateProbeController],
  providers: [
    // RATE-01: Global rate limit guard — all routes protected by ThrottlerModule config
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
