import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ThrottlerExceptionFilter } from './throttler/throttler-exception.filter.js';

process.on('uncaughtException', (err) => {
  process.stderr.write(
    `[FATAL] uncaughtException: ${err.stack ?? err.message}\n`,
  );
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  process.stderr.write(`[FATAL] unhandledRejection: ${String(reason)}\n`);
  process.exit(1);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // D-16: Trust Railway's load balancer for real client IP
  // Must be set BEFORE app.listen()
  const httpServer = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: number) => void;
  };
  httpServer.set('trust proxy', 1);

  // CORS: allow FRONTEND_URL in prod, all origins in dev
  const frontendUrl = process.env.FRONTEND_URL;
  app.enableCors({
    origin: frontendUrl ?? true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  });

  // D-18: Custom filter for exact 429 body + Retry-After header (must be before listen)
  app.useGlobalFilters(new ThrottlerExceptionFilter());

  // Global validation pipe for all DTOs
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Graceful shutdown — calls onModuleDestroy() on all providers including PrismaService
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
