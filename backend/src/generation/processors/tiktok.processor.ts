import { Injectable } from '@nestjs/common';
import type { MusicConcept } from '../types/music-concept.schema.js';
import type { PlatformProcessor } from './platform-processor.interface.js';
import type { TikTokOutput } from '../types/platform-result.types.js';

// D-05: Pure transform of MusicConcept — no LLM call, no I/O (PIPE-02)
@Injectable()
export class TikTokProcessor implements PlatformProcessor {
  readonly platform = 'tiktok';

  // T-02-01: Slug strips all non-alphanumeric chars — injected markup cannot survive
  private slug(value: string): string {
    return '#' + value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // D-05: exactly 3 hashtags: genre-slug + mood-slug + '#music'
  private buildHashtags(concept: MusicConcept): [string, string, string] {
    return [this.slug(concept.genre), this.slug(concept.mood), '#music'];
  }

  async generate(concept: MusicConcept): Promise<TikTokOutput> {
    return {
      hook: concept.description,
      hashtags: this.buildHashtags(concept),
    };
  }

  // D-07: Instance method guaranteed never to throw
  buildFallback(concept: MusicConcept): TikTokOutput {
    return {
      hook: concept.description,
      hashtags: this.buildHashtags(concept),
    };
  }
}
