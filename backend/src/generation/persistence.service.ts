import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

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
              payload: payload as object,
            },
          }),
        ),
      );

      return request.id;
    });
  }
}
