import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT', 3333);
  const prefix = configService.get<string>('API_PREFIX', '/api/v1');
  const corsOrigins = configService.get<string>('CORS_ORIGINS', '');

  // Global prefix
  app.setGlobalPrefix(prefix);

  // CORS
  app.enableCors({
    origin: corsOrigins ? corsOrigins.split(',') : '*',
    credentials: true,
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  await app.listen(port);
  logger.log(`🚀 API running on http://localhost:${port}${prefix}`);
  logger.log(`📋 Health check: http://localhost:${port}${prefix}/health`);
}

bootstrap();
