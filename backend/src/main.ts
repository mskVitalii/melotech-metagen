import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // D-16: Trust Railway's load balancer for real client IP
  // Must be set BEFORE app.listen()
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // CORS: allow FRONTEND_URL in prod, all origins in dev
  const frontendUrl = process.env.FRONTEND_URL;
  app.enableCors({
    origin: frontendUrl ?? true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  });

  // Global validation pipe for all DTOs
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Graceful shutdown — calls onModuleDestroy() on all providers including PrismaService
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
