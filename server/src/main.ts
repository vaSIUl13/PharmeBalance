import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger';

async function bootstrap(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  setupSwagger(app);
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  await app.listen(port);
}

void bootstrap();
