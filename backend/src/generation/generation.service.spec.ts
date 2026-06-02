import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { GenerationService } from './generation.service.js';
import { LLMProvider } from '../llm/llm-provider.abstract.js';
import { PlatformRegistry } from './processors/platform-registry.js';
import { PersistenceService } from './persistence.service.js';
import type { MusicConcept } from './types/music-concept.schema.js';
import type { PlatformProcessor } from './processors/platform-processor.interface.js';
import type { PlatformOutput } from './types/platform-result.types.js';

const fixtureConcept: MusicConcept = {
  title: 'Night Drive',
  genre: 'Synthwave',
  mood: 'Nostalgic',
  bpm: 110,
  instruments: ['synth', 'drums'],
  description: 'A late-night drive through neon-lit streets.',
};

const fixtureSpotifyOutput: PlatformOutput = {
  title: 'Night Drive',
  genre: 'Synthwave',
  mood: 'Nostalgic',
  bpm: 110,
  instruments: ['synth', 'drums'],
  description: 'A late-night drive through neon-lit streets.',
};

const fixtureTikTokOutput: PlatformOutput = {
  hook: 'A late-night drive through neon-lit streets.',
  hashtags: ['#synthwave', '#nostalgic', '#music'],
};

describe('GenerationService', () => {
  let service: GenerationService;
  let cacheGet: ReturnType<typeof jest.fn>;
  let cacheSet: ReturnType<typeof jest.fn>;
  let llmGenerateStructured: ReturnType<typeof jest.fn>;
  let registryGetProcessors: ReturnType<typeof jest.fn>;
  let persistenceServicePersist: ReturnType<typeof jest.fn>;

  // Fake processor that fulfills
  const fakeSpotifyProcessor: PlatformProcessor = {
    platform: 'spotify',
    generate: jest.fn().mockResolvedValue(fixtureSpotifyOutput) as PlatformProcessor['generate'],
    buildFallback: jest.fn().mockReturnValue(fixtureSpotifyOutput) as PlatformProcessor['buildFallback'],
  };

  // Fake processor that rejects
  const fakeTikTokProcessor: PlatformProcessor = {
    platform: 'tiktok',
    generate: jest.fn().mockRejectedValue(new Error('processor error')) as PlatformProcessor['generate'],
    buildFallback: jest.fn().mockReturnValue(fixtureTikTokOutput) as PlatformProcessor['buildFallback'],
  };

  beforeEach(async () => {
    cacheGet = jest.fn().mockResolvedValue(undefined); // Default: cache miss
    cacheSet = jest.fn().mockResolvedValue(undefined);
    llmGenerateStructured = jest.fn().mockResolvedValue(fixtureConcept);
    registryGetProcessors = jest.fn().mockReturnValue([fakeSpotifyProcessor]);
    persistenceServicePersist = jest.fn().mockResolvedValue('req_db');

    const module = await Test.createTestingModule({
      providers: [
        GenerationService,
        {
          provide: CACHE_MANAGER,
          useValue: { get: cacheGet, set: cacheSet },
        },
        {
          provide: LLMProvider,
          useValue: { generateStructured: llmGenerateStructured },
        },
        {
          provide: PlatformRegistry,
          useValue: { getProcessors: registryGetProcessors },
        },
        {
          provide: PersistenceService,
          useValue: { persist: persistenceServicePersist },
        },
      ],
    }).compile();

    service = module.get(GenerationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('cache hit', () => {
    it('returns cached response and does NOT call the LLM', async () => {
      const cachedResponse = { requestId: 'cached_id', results: { spotify: fixtureSpotifyOutput } };
      cacheGet.mockResolvedValue(cachedResponse);

      const result = await service.generate({ prompt: 'test prompt', targetPlatforms: ['spotify'] });

      expect(result).toEqual(cachedResponse);
      expect(llmGenerateStructured).not.toHaveBeenCalled();
      expect(persistenceServicePersist).not.toHaveBeenCalled();
      expect(cacheSet).not.toHaveBeenCalled();
    });

    it('uses sha256 cache key with sorted platforms', async () => {
      const cachedResponse = { requestId: 'cached_id', results: {} };
      cacheGet.mockResolvedValue(cachedResponse);

      // spotify + tiktok in one order
      await service.generate({ prompt: 'test', targetPlatforms: ['tiktok', 'spotify'] });
      const keyForReversed = (cacheGet.mock.calls[0] as string[])[0];

      cacheGet.mockResolvedValue(cachedResponse);
      // spotify + tiktok in the other order — should produce same key
      await service.generate({ prompt: 'test', targetPlatforms: ['spotify', 'tiktok'] });
      const keyForNormal = (cacheGet.mock.calls[1] as string[])[0];

      expect(keyForReversed).toBe(keyForNormal);
    });
  });

  describe('cache miss happy path', () => {
    it('calls LLM once on cache miss', async () => {
      await service.generate({ prompt: 'test prompt', targetPlatforms: ['spotify'] });
      expect(llmGenerateStructured).toHaveBeenCalledTimes(1);
    });

    it('returns one result per platform', async () => {
      const result = await service.generate({ prompt: 'test prompt', targetPlatforms: ['spotify'] });
      expect(result.results).toHaveProperty('spotify');
    });

    it('calls persist with the prompt and results', async () => {
      await service.generate({ prompt: 'test prompt', targetPlatforms: ['spotify'] });
      expect(persistenceServicePersist).toHaveBeenCalledTimes(1);
      expect(persistenceServicePersist).toHaveBeenCalledWith('test prompt', expect.any(Object));
    });

    it('calls cache.set with the response after persisting', async () => {
      await service.generate({ prompt: 'test prompt', targetPlatforms: ['spotify'] });
      expect(cacheSet).toHaveBeenCalledTimes(1);
    });

    it('returns the requestId from PersistenceService', async () => {
      const result = await service.generate({ prompt: 'test prompt', targetPlatforms: ['spotify'] });
      expect(result.requestId).toBe('req_db');
    });
  });

  describe('partial failure (one processor rejects)', () => {
    beforeEach(() => {
      // Return both processors: spotify (fulfills) + tiktok (rejects)
      registryGetProcessors.mockReturnValue([fakeSpotifyProcessor, fakeTikTokProcessor]);
    });

    it('does not throw when one processor rejects', async () => {
      await expect(
        service.generate({ prompt: 'test prompt', targetPlatforms: ['spotify', 'tiktok'] }),
      ).resolves.not.toThrow();
    });

    it('sets fallback:true on the rejected platform output', async () => {
      const result = await service.generate({ prompt: 'test prompt', targetPlatforms: ['spotify', 'tiktok'] });
      expect(result.results['tiktok']).toHaveProperty('fallback', true);
    });

    it('does NOT set fallback on the fulfilled platform output', async () => {
      const result = await service.generate({ prompt: 'test prompt', targetPlatforms: ['spotify', 'tiktok'] });
      expect(result.results['spotify']).not.toHaveProperty('fallback');
    });

    it('calls buildFallback on the failed processor with the concept', async () => {
      await service.generate({ prompt: 'test prompt', targetPlatforms: ['spotify', 'tiktok'] });
      expect(fakeTikTokProcessor.buildFallback).toHaveBeenCalledWith(fixtureConcept);
    });
  });

  describe('DB failure fallback', () => {
    it('uses crypto.randomUUID() requestId and does not throw when persist fails', async () => {
      persistenceServicePersist.mockRejectedValue(new Error('DB error'));
      const result = await service.generate({ prompt: 'test prompt', targetPlatforms: ['spotify'] });
      // Should still return a response with a requestId (UUID format: 8-4-4-4-12)
      expect(result.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });
});
