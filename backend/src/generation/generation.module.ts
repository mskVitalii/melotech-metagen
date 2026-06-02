import type { Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { LLMModule } from '../llm/llm.module.js';
import { GenerationController } from './generation.controller.js';
import { GenerationService } from './generation.service.js';
import { HistoryController } from './history.controller.js';
import { PersistenceService } from './persistence.service.js';
import type { PlatformProcessor } from './processors/platform-processor.interface.js';
import { PlatformRegistry } from './processors/platform-registry.js';
import { SpotifyProcessor } from './processors/spotify.processor.js';
import { TikTokProcessor } from './processors/tiktok.processor.js';
import { YouTubeProcessor } from './processors/youtube.processor.js';
import { PLATFORM_PROCESSOR } from './tokens.js';

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
    // Provide the processor collection as a single array token so PlatformRegistry
    // always receives all registered processors in runtime DI.
    {
      provide: PLATFORM_PROCESSOR,
      useFactory: (
        spotifyProcessor: SpotifyProcessor,
        tiktokProcessor: TikTokProcessor,
        youtubeProcessor: YouTubeProcessor,
      ): PlatformProcessor[] => [
        spotifyProcessor,
        tiktokProcessor,
        youtubeProcessor,
      ],
      inject: [SpotifyProcessor, TikTokProcessor, YouTubeProcessor],
    } as Provider,
    // Orchestration layer
    PlatformRegistry,
    GenerationService,
    PersistenceService,
  ],
  controllers: [GenerationController, HistoryController],
})
export class GenerationModule {}
