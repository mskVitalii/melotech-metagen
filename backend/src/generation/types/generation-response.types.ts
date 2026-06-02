import type { PlatformOutput } from './platform-result.types.js';

// D-19: Response type exported as TypeScript interface (not class-validator)
// NestJS serializes plain objects correctly; no class-transformer needed on responses
export type GenerateResponseDto = {
  requestId: string;
  results: Record<string, PlatformOutput>;
};
