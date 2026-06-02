import { Injectable, Inject } from '@nestjs/common';
import { PLATFORM_PROCESSOR } from '../tokens.js';
import type { PlatformProcessor } from './platform-processor.interface.js';

// D-02: PlatformRegistry resolves processors by platform name from a Map
// built from the injected PLATFORM_PROCESSOR multi-provider array
@Injectable()
export class PlatformRegistry {
  private readonly processorMap: Map<string, PlatformProcessor>;

  constructor(@Inject(PLATFORM_PROCESSOR) processors: PlatformProcessor[]) {
    // D-02: Build Map<string, PlatformProcessor> keyed by processor.platform
    // Guard: NestJS multi-provider injects an array, but normalize defensively
    const list = Array.isArray(processors)
      ? processors
      : processors
        ? [processors as PlatformProcessor]
        : [];
    this.processorMap = new Map(list.map((p) => [p.platform, p]));
  }

  // Returns processors matching the given platform names.
  // Unknown platform names are silently skipped (T-02-03: defense-in-depth).
  getProcessors(platforms: string[]): PlatformProcessor[] {
    return platforms
      .filter((p) => this.processorMap.has(p))
      .map((p) => this.processorMap.get(p)!);
  }
}
