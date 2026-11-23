import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupSwagger } from './swagger/setup';
import { validateAuthConfig } from './modules/auth/auth-config';

async function bootstrap(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  validateAuthConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const trustedProxies = process.env.AUTH_TRUSTED_PROXIES?.split(',').map((value) => value.trim()).filter(Boolean);
  if (trustedProxies?.length) app.set('trust proxy', trustedProxies);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  if (process.env.NODE_ENV !== 'production') setupSwagger(app);
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  await app.listen(port);
}

void bootstrap();
