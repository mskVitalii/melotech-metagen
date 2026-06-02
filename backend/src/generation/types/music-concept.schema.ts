import { z } from 'zod';

export const MusicConceptSchema = z.object({
  title: z.string(),
  genre: z.string(),
  mood: z.string(),
  bpm: z.number().int().min(40).max(250),
  instruments: z.array(z.string()),
  description: z.string(),
});

export type MusicConcept = z.infer<typeof MusicConceptSchema>;
