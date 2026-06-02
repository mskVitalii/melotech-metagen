import { Injectable } from '@nestjs/common';
import type { MusicConcept } from '../types/music-concept.schema.js';
import type { SpotifyOutput } from '../types/platform-result.types.js';
import type { PlatformProcessor } from './platform-processor.interface.js';

// D-04: Pure transform of MusicConcept — no LLM call, no I/O (PIPE-02)
@Injectable()
export class SpotifyProcessor implements PlatformProcessor {
  readonly platform = 'spotify';

  generate(concept: MusicConcept): Promise<SpotifyOutput> {
    return Promise.resolve({
      title: concept.title,
      genre: concept.genre,
      mood: concept.mood,
      bpm: concept.bpm,
      instruments: concept.instruments,
      description: concept.description,
    });
  }

  // D-07: Instance method that is guaranteed never to throw
  buildFallback(concept: MusicConcept): SpotifyOutput {
    return {
      title: concept.title,
      genre: concept.genre,
      mood: concept.mood,
      bpm: concept.bpm,
      instruments: concept.instruments,
      description: concept.description,
    };
  }
}
