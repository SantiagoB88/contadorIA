import 'reflect-metadata';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.module';

// Money is stored as BigInt (minor units). `JSON.stringify` throws on BigInt by
// default; serialize it as a string so responses never crash. Response mappers
// still convert money explicitly where a numeric shape is expected.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint): string {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(PinoLogger));

  const config = app.get(AppConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('CORS_ORIGINS'),
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('DashGoBo API')
    .setDescription('API central de facturación. Contratos versionados bajo /api/v1.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = config.get('API_PORT');
  await app.listen(port);

  const logger = app.get(PinoLogger);
  logger.log(`DashGoBo API listening on http://localhost:${port} (Swagger: /docs)`);
}

void bootstrap();
