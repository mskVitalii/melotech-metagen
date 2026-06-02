import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { createHash, randomUUID } from 'node:crypto';
import { LLMProvider } from '../llm/llm-provider.abstract.js';
import { MusicConceptSchema } from './types/music-concept.schema.js';
import type { MusicConcept } from './types/music-concept.schema.js';
import { PlatformRegistry } from './processors/platform-registry.js';
import { PersistenceService } from './persistence.service.js';
import type { GenerateRequestDto } from './types/generate-request.dto.js';
import type { GenerateResponseDto } from './types/generation-response.types.js';
import type { PlatformOutput } from './types/platform-result.types.js';

// D-11: Combined system + user prompt for LLM structured output
const buildUserPrompt = (prompt: string): string =>
  `You are a music metadata expert. Generate a complete MusicConcept for the following music idea. Respond with valid JSON matching the schema exactly.\n\nMusic idea: ${prompt}`;

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    // D-09: CACHE_MANAGER injection — manual get/set for POST endpoint (HTTP interceptor won't work)
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    // PIPE-01: LLMProvider abstract class as DI token
    private readonly llmProvider: LLMProvider,
    // D-02/PROC-05: PlatformRegistry only — never concrete processors (OCP)
    private readonly registry: PlatformRegistry,
    // D-14: PersistenceService is a separate injected dependency
    private readonly persistenceService: PersistenceService,
  ) {}

  // D-08: sha256(prompt + '|' + sortedPlatforms) — '|' cannot appear in platform names
  private buildCacheKey(prompt: string, targetPlatforms: string[]): string {
    const sorted = [...targetPlatforms].sort().join(',');
    return createHash('sha256').update(`${prompt}|${sorted}`).digest('hex');
  }

  // D-12: Promise.allSettled fan-out — never throws on partial failure (PIPE-03, PIPE-04)
  private async fanOut(
    processors: Awaited<ReturnType<PlatformRegistry['getProcessors']>>,
    concept: MusicConcept,
  ): Promise<Record<string, PlatformOutput>> {
    const settled = await Promise.allSettled(processors.map(p => p.generate(concept)));

    const output: Record<string, PlatformOutput> = {};
    settled.forEach((result, index) => {
      const processor = processors[index]!;
      if (result.status === 'fulfilled') {
        output[processor.platform] = result.value;
      } else {
        // D-12: Fallback reconstruction on rejection; set fallback:true (PIPE-04)
        output[processor.platform] = {
          ...processor.buildFallback(concept),
          fallback: true as const,
        };
      }
    });

    return output;
  }

  async generate(dto: GenerateRequestDto): Promise<GenerateResponseDto> {
    const { prompt, targetPlatforms } = dto;

    // STEP 1 (D-09): Cache check FIRST — before any LLM call (CACHE-02, CACHE-03)
    const cacheKey = this.buildCacheKey(prompt, targetPlatforms);
    const cached = await this.cache.get<GenerateResponseDto>(cacheKey);
    if (cached) {
      return cached;
    }

    // STEP 2 (PIPE-01, D-11): LLM call on cache miss
    const userPrompt = buildUserPrompt(prompt);
    const concept = await this.llmProvider.generateStructured(userPrompt, MusicConceptSchema);

    // STEP 3 (PIPE-03, D-12): Parallel fan-out via registry — Promise.allSettled, fallback on rejection
    const processors = this.registry.getProcessors(targetPlatforms);
    const results = await this.fanOut(processors, concept);

    // STEP 4 (PERSIST-01/02, D-15): Persist in try/catch — DB failure must not fail the response
    let requestId: string;
    try {
      requestId = await this.persistenceService.persist(prompt, results);
    } catch (err) {
      // D-15: Log DB error internally; fall back to crypto.randomUUID() (T-02-07: no stack trace to client)
      this.logger.error('DB write failed — using fallback requestId', err);
      requestId = randomUUID();
    }

    // STEP 5 (D-10): Cache write AFTER successful persistence — NEVER before (RESEARCH Pitfall 5)
    const response: GenerateResponseDto = { requestId, results };
    await this.cache.set(cacheKey, response);

    // STEP 6: Return response
    return response;
  }
}
