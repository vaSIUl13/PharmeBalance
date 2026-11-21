import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('PharmaBalance API')
    .setDescription('API управління запасами аптечної мережі')
    .setVersion('1.0')
    .addCookieAuth('__Host-pharme-session', { type: 'apiKey' }, '__Host-pharme-session')
    .addSecurityRequirements('__Host-pharme-session')
    .addGlobalParameters({ in: 'header', name: 'X-Pharme-CSRF', required: false, schema: { type: 'string', example: '1' } })
    .build();

  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: '/openapi.json',
  });
}
