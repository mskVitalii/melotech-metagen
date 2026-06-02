import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { OpenAIProvider } from './openai.provider';
import { MusicConceptSchema } from '../generation/types/music-concept.schema';

// Mock the openai module
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          parse: jest.fn(),
        },
      },
    })),
  };
});

// Mock zodResponseFormat
jest.mock('openai/helpers/zod', () => ({
  zodResponseFormat: jest.fn().mockReturnValue({ type: 'json_schema' }),
}));

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  let mockParse: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAIProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal?: string) => {
              if (key === 'OPENAI_API_KEY') return 'test-api-key';
              if (key === 'OPENAI_MODEL') return defaultVal ?? 'gpt-5.4';
              return defaultVal;
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<OpenAIProvider>(OpenAIProvider);

    // Access the mocked parse function
    mockParse = (provider as any).openai.chat.completions.parse;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateStructured', () => {
    const validConcept = {
      title: 'Test Track',
      genre: 'pop',
      mood: 'happy',
      bpm: 120,
      instruments: ['piano'],
      description: 'A test track',
    };

    it('returns message.parsed on success', async () => {
      mockParse.mockResolvedValue({
        choices: [
          {
            message: {
              parsed: validConcept,
              refusal: null,
            },
          },
        ],
      });

      const result = await provider.generateStructured('Generate a pop track', MusicConceptSchema);
      expect(result).toEqual(validConcept);
    });

    it('throws BadRequestException (400) when message.refusal is set', async () => {
      const refusalMessage = 'This content violates our usage policies.';
      mockParse.mockResolvedValue({
        choices: [
          {
            message: {
              parsed: null,
              refusal: refusalMessage,
            },
          },
        ],
      });

      await expect(
        provider.generateStructured('Generate explicit content', MusicConceptSchema),
      ).rejects.toThrow(BadRequestException);

      await expect(
        provider.generateStructured('Generate explicit content', MusicConceptSchema),
      ).rejects.toThrow('Content policy refusal');
    });

    it('throws InternalServerErrorException (500) when parsed is null and no refusal', async () => {
      mockParse.mockResolvedValue({
        choices: [
          {
            message: {
              parsed: null,
              refusal: null,
            },
          },
        ],
      });

      await expect(
        provider.generateStructured('Generate a track', MusicConceptSchema),
      ).rejects.toThrow(InternalServerErrorException);

      await expect(
        provider.generateStructured('Generate a track', MusicConceptSchema),
      ).rejects.toThrow('LLM returned no parsed output');
    });

    it('throws InternalServerErrorException (500) when choices is empty', async () => {
      mockParse.mockResolvedValue({
        choices: [],
      });

      await expect(
        provider.generateStructured('Generate a track', MusicConceptSchema),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('uses chat.completions.parse with zodResponseFormat', async () => {
      mockParse.mockResolvedValue({
        choices: [{ message: { parsed: validConcept, refusal: null } }],
      });

      await provider.generateStructured('Test prompt', MusicConceptSchema);

      expect(mockParse).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Test prompt' }],
          response_format: expect.objectContaining({ type: 'json_schema' }),
        }),
      );
    });
  });
});
