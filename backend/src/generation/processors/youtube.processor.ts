import { Injectable } from '@nestjs/common';
import type { MusicConcept } from '../types/music-concept.schema.js';
import type { YouTubeOutput } from '../types/platform-result.types.js';
import type { PlatformProcessor } from './platform-processor.interface.js';

// D-06: Pure transform of MusicConcept — no LLM call, no I/O (PIPE-02)
@Injectable()
export class YouTubeProcessor implements PlatformProcessor {
  readonly platform = 'youtube';

  // D-06: SEO title = `${concept.title} | ${concept.genre} ${concept.mood}`
  private buildTitle(concept: MusicConcept): string {
    return `${concept.title} | ${concept.genre} ${concept.mood}`;
  }

  // D-06: tags = [...instruments, genre, mood]
  private buildTags(concept: MusicConcept): string[] {
    return [...concept.instruments, concept.genre, concept.mood];
  }

  generate(concept: MusicConcept): Promise<YouTubeOutput> {
    return Promise.resolve({
      title: this.buildTitle(concept),
      description: concept.description,
      tags: this.buildTags(concept),
    });
  }

  // D-07: Instance method guaranteed never to throw
  buildFallback(concept: MusicConcept): YouTubeOutput {
    return {
      title: this.buildTitle(concept),
      description: concept.description,
      tags: this.buildTags(concept),
    };
  }
}
