import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-5.4'),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().url().optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export function validate(config: Record<string, unknown>) {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Environment validation failed:\n${result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  }
  return result.data;
}
