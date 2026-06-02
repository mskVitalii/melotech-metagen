import { ZodSchema } from 'zod';

export abstract class LLMProvider {
  abstract generateStructured<T>(prompt: string, schema: ZodSchema<T>): Promise<T>;
}
