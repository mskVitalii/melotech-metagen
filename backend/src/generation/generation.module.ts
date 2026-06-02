import { Module } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { LLMModule } from '../llm/llm.module.js';
import { PLATFORM_PROCESSOR } from './tokens.js';
import { SpotifyProcessor } from './processors/spotify.processor.js';
import { TikTokProcessor } from './processors/tiktok.processor.js';
import { YouTubeProcessor } from './processors/youtube.processor.js';
import { PlatformRegistry } from './processors/platform-registry.js';
import { GenerationService } from './generation.service.js';
import { PersistenceService } from './persistence.service.js';
import { GenerationController } from './generation.controller.js';

// D-20: GenerationModule imports LLMModule; PrismaModule and CacheModule are @Global() — no re-import needed
// D-02/RESEARCH Pattern 1: Each processor must appear TWICE in providers:
//   1. Bare class (so NestJS can construct it)
//   2. Multi-provider alias (so PlatformRegistry receives PlatformProcessor[])
// Omitting the bare class causes "Nest can't resolve dependencies" (RESEARCH Pitfall 1)
@Module({
  imports: [LLMModule],
  providers: [
    // Self-registration — NestJS constructs these classes
    SpotifyProcessor,
    TikTokProcessor,
    YouTubeProcessor,
    // Multi-provider aliases — PlatformRegistry @Inject(PLATFORM_PROCESSOR) receives all three
    // Note: `multi` is a valid NestJS runtime property; type cast needed since ExistingProvider
    // interface in @nestjs/common does not declare it (type gap, not a runtime issue)
    { provide: PLATFORM_PROCESSOR, useExisting: SpotifyProcessor, multi: true } as Provider,
    { provide: PLATFORM_PROCESSOR, useExisting: TikTokProcessor, multi: true } as Provider,
    { provide: PLATFORM_PROCESSOR, useExisting: YouTubeProcessor, multi: true } as Provider,
    // Orchestration layer
    PlatformRegistry,
    GenerationService,
    PersistenceService,
  ],
  controllers: [GenerationController],
})
export class GenerationModule {}
