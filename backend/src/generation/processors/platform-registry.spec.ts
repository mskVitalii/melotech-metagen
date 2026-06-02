import { PlatformRegistry } from './platform-registry.js';
import type { PlatformProcessor } from './platform-processor.interface.js';
import type { MusicConcept } from '../types/music-concept.schema.js';
import type { PlatformOutput } from '../types/platform-result.types.js';

// Minimal fake processors — no NestJS TestingModule needed for unit test
const concept: MusicConcept = {
  title: 'Night Drive',
  genre: 'Synthwave',
  mood: 'Nostalgic',
  bpm: 110,
  instruments: ['synth', 'drums'],
  description: 'A late-night drive through neon-lit streets.',
};

const fakeSpotifyOutput: PlatformOutput = {
  title: 'Night Drive',
  genre: 'Synthwave',
  mood: 'Nostalgic',
  bpm: 110,
  instruments: ['synth', 'drums'],
  description: 'A late-night drive through neon-lit streets.',
};

const fakeTikTokOutput: PlatformOutput = {
  hook: 'A late-night drive through neon-lit streets.',
  hashtags: ['#synthwave', '#nostalgic', '#music'],
};

const fakeYouTubeOutput: PlatformOutput = {
  title: 'Night Drive | Synthwave Nostalgic',
  description: 'A late-night drive through neon-lit streets.',
  tags: ['synth', 'drums', 'Synthwave', 'Nostalgic'],
};

const fakeSpotify: PlatformProcessor = {
  platform: 'spotify',
  generate: async (_concept: MusicConcept) => fakeSpotifyOutput,
  buildFallback: (_concept: MusicConcept) => fakeSpotifyOutput,
};

const fakeTikTok: PlatformProcessor = {
  platform: 'tiktok',
  generate: async (_concept: MusicConcept) => fakeTikTokOutput,
  buildFallback: (_concept: MusicConcept) => fakeTikTokOutput,
};

const fakeYouTube: PlatformProcessor = {
  platform: 'youtube',
  generate: async (_concept: MusicConcept) => fakeYouTubeOutput,
  buildFallback: (_concept: MusicConcept) => fakeYouTubeOutput,
};

describe('PlatformRegistry', () => {
  let registry: PlatformRegistry;

  beforeEach(() => {
    registry = new PlatformRegistry([fakeSpotify, fakeTikTok, fakeYouTube]);
  });

  it('should build a Map from the injected processors array', () => {
    const result = registry.getProcessors(['spotify']);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(fakeSpotify);
  });

  it('getProcessors(["tiktok","spotify"]) returns tiktok and spotify processors', () => {
    const result = registry.getProcessors(['tiktok', 'spotify']);
    expect(result).toHaveLength(2);
    expect(result).toContain(fakeTikTok);
    expect(result).toContain(fakeSpotify);
  });

  it('getProcessors(["unknown"]) returns []', () => {
    const result = registry.getProcessors(['unknown']);
    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  it('getProcessors with mix of known and unknown returns only known', () => {
    const result = registry.getProcessors(['spotify', 'unknown', 'youtube']);
    expect(result).toHaveLength(2);
    expect(result).toContain(fakeSpotify);
    expect(result).toContain(fakeYouTube);
  });

  it('getProcessors([]) returns []', () => {
    const result = registry.getProcessors([]);
    expect(result).toHaveLength(0);
  });

  it('getProcessors returns all three processors for all platforms', () => {
    const result = registry.getProcessors(['spotify', 'tiktok', 'youtube']);
    expect(result).toHaveLength(3);
  });

  it('registry does not import concrete processor classes (OCP - PROC-05)', () => {
    // This test verifies the registry can work with any PlatformProcessor implementation
    // The registry is constructed with the injected array — no hardcoded imports
    const customProcessor: PlatformProcessor = {
      platform: 'custom',
      generate: async (_c: MusicConcept) => ({
        title: 'custom',
        description: '',
        tags: [],
      }),
      buildFallback: (_c: MusicConcept) => ({
        title: 'custom',
        description: '',
        tags: [],
      }),
    };
    const customRegistry = new PlatformRegistry([customProcessor]);
    const result = customRegistry.getProcessors(['custom']);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(customProcessor);
  });
});
