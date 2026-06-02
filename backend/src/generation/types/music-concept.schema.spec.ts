import { MusicConceptSchema } from './music-concept.schema';

describe('MusicConceptSchema', () => {
  const validConcept = {
    title: 'Midnight Drive',
    genre: 'synthwave',
    mood: 'nostalgic',
    bpm: 120,
    instruments: ['guitar', 'synthesizer'],
    description: 'A late-night synthwave track with retro vibes',
  };

  it('parses a valid concept successfully', () => {
    expect(() => MusicConceptSchema.parse(validConcept)).not.toThrow();
    const result = MusicConceptSchema.parse(validConcept);
    expect(result).toEqual(validConcept);
  });

  it('throws when bpm is below min (40)', () => {
    expect(() =>
      MusicConceptSchema.parse({ ...validConcept, bpm: 30 }),
    ).toThrow();
  });

  it('throws when bpm is above max (250)', () => {
    expect(() =>
      MusicConceptSchema.parse({ ...validConcept, bpm: 300 }),
    ).toThrow();
  });

  it('accepts bpm at boundary values (40 and 250)', () => {
    expect(() =>
      MusicConceptSchema.parse({ ...validConcept, bpm: 40 }),
    ).not.toThrow();
    expect(() =>
      MusicConceptSchema.parse({ ...validConcept, bpm: 250 }),
    ).not.toThrow();
  });

  it('throws when bpm is not an integer', () => {
    expect(() =>
      MusicConceptSchema.parse({ ...validConcept, bpm: 120.5 }),
    ).toThrow();
  });

  it('throws when required fields are missing', () => {
    const { title, ...withoutTitle } = validConcept;
    expect(() => MusicConceptSchema.parse(withoutTitle)).toThrow();
  });
});
