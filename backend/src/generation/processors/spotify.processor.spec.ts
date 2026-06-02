import { SpotifyProcessor } from './spotify.processor.js';
import type { MusicConcept } from '../types/music-concept.schema.js';

const concept: MusicConcept = {
  title: 'Night Drive',
  genre: 'Synthwave',
  mood: 'Nostalgic',
  bpm: 110,
  instruments: ['synth', 'drums'],
  description: 'A late-night drive through neon-lit streets.',
};

describe('SpotifyProcessor', () => {
  let processor: SpotifyProcessor;

  beforeEach(() => {
    processor = new SpotifyProcessor();
  });

  it('should have platform === "spotify"', () => {
    expect(processor.platform).toBe('spotify');
  });

  it('generate() should resolve to the correct SpotifyOutput shape', async () => {
    const result = await processor.generate(concept);
    expect(result).toEqual({
      title: 'Night Drive',
      genre: 'Synthwave',
      mood: 'Nostalgic',
      bpm: 110,
      instruments: ['synth', 'drums'],
      description: 'A late-night drive through neon-lit streets.',
    });
  });

  it('generate() should include all required fields', async () => {
    const result = await processor.generate(concept);
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('genre');
    expect(result).toHaveProperty('mood');
    expect(result).toHaveProperty('bpm');
    expect(result).toHaveProperty('instruments');
    expect(result).toHaveProperty('description');
  });

  it('buildFallback() should deep-equal the resolved value of generate()', async () => {
    const generated = await processor.generate(concept);
    const fallback = processor.buildFallback(concept);
    expect(fallback).toEqual(generated);
  });

  it('buildFallback() should never throw', () => {
    expect(() => processor.buildFallback(concept)).not.toThrow();
  });
});
