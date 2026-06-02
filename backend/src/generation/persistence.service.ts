import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { HistoryQueryDto } from './types/history-query.dto.js';
import type { HistoryResponse } from './types/history.types.js';

// D-14: PersistenceService is separate from GenerationService — injected dependency
// D-15: Wraps all DB writes in a single $transaction (callback form — required because result rows need requestId)
@Injectable()
export class PersistenceService {
  private readonly logger = new Logger(PersistenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // D-14/D-15: Write GenerationRequest + one GenerationResult per platform in a single transaction.
  // D-16: Returns the created GenerationRequest.id (cuid) as the requestId.
  // D-17: payload stores the full platform output object including fallback flag when present.
  async persist(
    prompt: string,
    results: Record<string, object>,
  ): Promise<string> {
    // Callback form is mandatory (RESEARCH Pitfall 4):
    // GenerationResult rows need the requestId from the created GenerationRequest.
    // The array form cannot reference the result of an earlier operation in the same call.
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.generationRequest.create({
        data: { prompt },
      });

      await Promise.all(
        Object.entries(results).map(([platform, payload]) =>
          tx.generationResult.create({
            data: {
              requestId: request.id,
              platform,
              payload,
            },
          }),
        ),
      );

      return request.id;
    });
  }

  // D-01/D-02/D-03: Single-query history fetch — no N+1 via include: { results: true }
  // D-04: Pagination via skip/take; D-05: Optional platform filter
  async findHistory({
    page = 1,
    limit = 20,
    platform,
  }: HistoryQueryDto): Promise<HistoryResponse> {
    const where = platform ? { results: { some: { platform } } } : {};

    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      this.prisma.generationRequest.findMany({
        where,
        include: { results: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.generationRequest.count({ where }),
    ]);

    return {
      data: requests.map((r) => ({
        id: r.id,
        prompt: r.prompt,
        createdAt: r.createdAt.toISOString(),
        results: r.results.map((res) => ({
          platform: res.platform,
          payload: res.payload,
        })),
      })),
      total,
      page,
      limit,
    };
  }

  async findLatestByPromptAndPlatforms(
    prompt: string,
    targetPlatforms: string[],
  ): Promise<HistoryResponse['data'][number] | null> {
    const expectedPlatforms = [...targetPlatforms].sort();

    const requests = await this.prisma.generationRequest.findMany({
      where: { prompt },
      include: { results: true },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    const match = requests.find((request) => {
      const actualPlatforms = request.results
        .map((result) => result.platform)
        .sort();

      return (
        actualPlatforms.length === expectedPlatforms.length &&
        actualPlatforms.every(
          (platform, index) => platform === expectedPlatforms[index],
        )
      );
    });

    if (!match) {
      return null;
    }

    return {
      id: match.id,
      prompt: match.prompt,
      createdAt: match.createdAt.toISOString(),
      results: match.results.map((result) => ({
        platform: result.platform,
        payload: result.payload,
      })),
    };
  }
}
