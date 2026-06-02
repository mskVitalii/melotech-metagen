import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { PersistenceService } from './persistence.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('PersistenceService', () => {
  let service: PersistenceService;
  let prisma: { $transaction: ReturnType<typeof jest.fn> };
  let txRequestCreate: ReturnType<typeof jest.fn>;
  let txResultCreate: ReturnType<typeof jest.fn>;

  beforeEach(async () => {
    txRequestCreate = jest.fn().mockResolvedValue({ id: 'req_1' });
    txResultCreate = jest.fn().mockResolvedValue({});

    const txMock = {
      generationRequest: { create: txRequestCreate },
      generationResult: { create: txResultCreate },
    };

    prisma = {
      // D-15: $transaction invokes the callback with txMock
      $transaction: jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
    };

    const module = await Test.createTestingModule({
      providers: [
        PersistenceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(PersistenceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call $transaction once', async () => {
    await service.persist('test prompt', {
      spotify: { title: 'Test', genre: 'pop', mood: 'happy', bpm: 120, instruments: ['guitar'], description: 'A song' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('should create one GenerationRequest with the prompt', async () => {
    await service.persist('test prompt', {
      spotify: { title: 'Test', genre: 'pop', mood: 'happy', bpm: 120, instruments: ['guitar'], description: 'A song' },
    });
    expect(txRequestCreate).toHaveBeenCalledTimes(1);
    expect(txRequestCreate).toHaveBeenCalledWith({ data: { prompt: 'test prompt' } });
  });

  it('should create one GenerationResult per platform', async () => {
    const results = {
      spotify: { title: 'Test', genre: 'pop', mood: 'happy', bpm: 120, instruments: ['guitar'], description: 'A song' },
      tiktok: { hook: 'This is a hook', hashtags: ['#pop', '#happy', '#music'] },
    };
    await service.persist('test prompt', results);
    expect(txResultCreate).toHaveBeenCalledTimes(2);
    expect(txResultCreate).toHaveBeenCalledWith({
      data: { requestId: 'req_1', platform: 'spotify', payload: results.spotify },
    });
    expect(txResultCreate).toHaveBeenCalledWith({
      data: { requestId: 'req_1', platform: 'tiktok', payload: results.tiktok },
    });
  });

  it('should return the GenerationRequest id as the requestId', async () => {
    const requestId = await service.persist('another prompt', {
      youtube: { title: 'YT', description: 'desc', tags: ['a'] },
    });
    expect(requestId).toBe('req_1');
  });
});
