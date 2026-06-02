import { TikTokProcessor } from './tiktok.processor.js';
import type { MusicConcept } from '../types/music-concept.schema.js';

const concept: MusicConcept = {
  title: 'Night Drive',
  genre: 'Synthwave',
  mood: 'Nostalgic',
  bpm: 110,
  instruments: ['synth', 'drums'],
  description: 'A late-night drive through neon-lit streets.',
};

describe('TikTokProcessor', () => {
  let processor: TikTokProcessor;

  beforeEach(() => {
    processor = new TikTokProcessor();
  });

  it('should have platform === "tiktok"', () => {
    expect(processor.platform).toBe('tiktok');
  });

  it('generate() should resolve to the correct TikTokOutput shape', async () => {
    const result = await processor.generate(concept);
    expect(result).toHaveProperty('hook');
    expect(result).toHaveProperty('hashtags');
  });

  it('generate() hashtags should have exactly 3 elements', async () => {
    const result = await processor.generate(concept);
    expect(result.hashtags).toHaveLength(3);
  });

  it('generate() last hashtag should be "#music"', async () => {
    const result = await processor.generate(concept);
    expect(result.hashtags[2]).toBe('#music');
  });

  it('generate() hashtags should be derived from genre and mood slugs', async () => {
    const result = await processor.generate(concept);
    // genre slug: '#synthwave', mood slug: '#nostalgic', third: '#music'
    expect(result.hashtags[0]).toBe('#synthwave');
    expect(result.hashtags[1]).toBe('#nostalgic');
    expect(result.hashtags[2]).toBe('#music');
  });

  it('hashtag slugs should strip non-alphanumeric characters', async () => {
    const conceptWithSpecialChars: MusicConcept = {
      ...concept,
      genre: 'Hip-Hop',
      mood: 'Chill Vibes',
    };
    const result = await processor.generate(conceptWithSpecialChars);
    // 'Hip-Hop' → '#hiphop', 'Chill Vibes' → '#chillvibes'
    expect(result.hashtags[0]).toBe('#hiphop');
    expect(result.hashtags[1]).toBe('#chillvibes');
    expect(result.hashtags[2]).toBe('#music');
  });

  it('buildFallback() should deep-equal the resolved value of generate()', async () => {
    const generated = await processor.generate(concept);
    const fallback = processor.buildFallback(concept);
    expect(fallback).toEqual(generated);
  });

  it('buildFallback() should never throw', () => {
    expect(() => processor.buildFallback(concept)).not.toThrow();
  });

  it('buildFallback() hashtags should have exactly 3 elements', () => {
    const fallback = processor.buildFallback(concept);
    expect(fallback.hashtags).toHaveLength(3);
  });
});
