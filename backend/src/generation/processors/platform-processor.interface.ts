import type { MusicConcept } from '../types/music-concept.schema.js';
import type { PlatformOutput } from '../types/platform-result.types.js';

// D-01: PlatformProcessor interface — pure transform contract (no shared state)
// D-07: buildFallback is an instance method (TypeScript interfaces cannot declare static);
//       "static" in D-07 means "no dependence on instance state / never throws"
export interface PlatformProcessor {
  readonly platform: string;
  generate(concept: MusicConcept): Promise<PlatformOutput>;
  buildFallback(concept: MusicConcept): PlatformOutput;
}
