import { YouTubeProcessor } from './youtube.processor.js';
import type { MusicConcept } from '../types/music-concept.schema.js';

const concept: MusicConcept = {
  title: 'Night Drive',
  genre: 'Synthwave',
  mood: 'Nostalgic',
  bpm: 110,
  instruments: ['synth', 'drums'],
  description: 'A late-night drive through neon-lit streets.',
};

describe('YouTubeProcessor', () => {
  let processor: YouTubeProcessor;

  beforeEach(() => {
    processor = new YouTubeProcessor();
  });

  it('should have platform === "youtube"', () => {
    expect(processor.platform).toBe('youtube');
  });

  it('generate() should resolve to the correct YouTubeOutput shape', async () => {
    const result = await processor.generate(concept);
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('tags');
  });

  it('generate() title should follow SEO format: "title | genre mood"', async () => {
    const result = await processor.generate(concept);
    expect(result.title).toBe('Night Drive | Synthwave Nostalgic');
  });

  it('generate() tags should include instruments, genre, and mood', async () => {
    const result = await processor.generate(concept);
    expect(result.tags).toContain('synth');
    expect(result.tags).toContain('drums');
    expect(result.tags).toContain('Synthwave');
    expect(result.tags).toContain('Nostalgic');
  });

  it('generate() tags should equal [...instruments, genre, mood]', async () => {
    const result = await processor.generate(concept);
    expect(result.tags).toEqual(['synth', 'drums', 'Synthwave', 'Nostalgic']);
  });

  it('buildFallback() should deep-equal the resolved value of generate()', async () => {
    const generated = await processor.generate(concept);
    const fallback = processor.buildFallback(concept);
    expect(fallback).toEqual(generated);
  });

  it('buildFallback() should never throw', () => {
    expect(() => processor.buildFallback(concept)).not.toThrow();
  });

  it('buildFallback() title should follow SEO format', () => {
    const fallback = processor.buildFallback(concept);
    expect(fallback.title).toBe('Night Drive | Synthwave Nostalgic');
  });
});
