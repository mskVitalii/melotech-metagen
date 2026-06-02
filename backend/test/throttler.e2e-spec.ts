import * as request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ThrottlerExceptionFilter } from '../src/throttler/throttler-exception.filter';

describe('Throttler e2e (POST /rate-probe)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Mirror main.ts setup
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new ThrottlerExceptionFilter());

    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('should allow the first 3 POST /rate-probe requests from the same IP', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app.getHttpServer())
        .post('/rate-probe')
        .set('X-Forwarded-For', '1.2.3.4');
      expect(res.status).toBeLessThan(400);
    }
  });

  it('should return 429 on the 4th POST /rate-probe request with exact D-18 body', async () => {
    const res = await request(app.getHttpServer())
      .post('/rate-probe')
      .set('X-Forwarded-For', '1.2.3.4');

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      statusCode: 429,
      message: 'Too Many Requests',
      retryAfter: 60,
    });
    expect(res.headers['retry-after']).toBe('60');
  });
});
