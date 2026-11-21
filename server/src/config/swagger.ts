import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('PharmaBalance API')
    .setDescription('API управління запасами аптечної мережі')
    .setVersion('1.0')
    .build();

  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: '/openapi.json',
  });
}
