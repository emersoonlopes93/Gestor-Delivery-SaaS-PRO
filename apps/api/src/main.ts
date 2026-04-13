import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { StructuredLoggerService } from './common/logging/structured-logger.service';
import { requestIdMiddleware } from './common/middlewares/request-id.middleware';
import helmet from 'helmet';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: StructuredLoggerService.fromEnv(),
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT', 3333);
  const prefix = configService.get<string>('API_PREFIX', '/api/v1');
  const corsOrigins = configService.get<string>('CORS_ORIGINS', '');
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const enableSwagger = configService.get<string>('SWAGGER_ENABLED', 'false') === 'true';
  const swaggerPath = configService.get<string>('SWAGGER_PATH', '/docs');

  // Global prefix
  app.setGlobalPrefix(prefix);

  // Basic hardening
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // Request ID
  app.use(requestIdMiddleware);

  // Security headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CORS
  const origin = corsOrigins ? corsOrigins.split(',') : [];
  if (nodeEnv === 'production' && origin.length === 0) {
    logger.warn('CORS_ORIGINS is empty in production; CORS will be disabled.');
  }

  app.enableCors({
    origin: origin.length > 0 ? origin : nodeEnv === 'production' ? false : '*',
    credentials: true,
  });

  // Swagger
  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Gestor Delivery API')
      .setDescription('Documentação básica da API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerPath.replace(/^\//, ''), app, document);
    logger.log(`📚 Swagger enabled at ${swaggerPath}`);
  }

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
