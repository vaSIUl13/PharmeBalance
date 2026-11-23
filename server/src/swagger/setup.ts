import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function createSwaggerDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('PharmaBalance API')
    .setDescription(
      'API управління запасами аптечної мережі. Увійди через /login під тим самим origin ' +
      'і заверши MFA. Swagger використовує cookie браузера. Залиш поле Authorize порожнім. ' +
      'Для запитів, які змінюють дані, вкажи X-Pharme-CSRF зі значенням 1.',
    )
    .setVersion('1.0')
    .addCookieAuth('__Host-pharme-session', { type: 'apiKey', description: 'Цю HttpOnly cookie встановлює сервер після входу. Залиш це поле порожнім.' }, '__Host-pharme-session')
    .addSecurityRequirements('__Host-pharme-session')
    .addGlobalParameters({ in: 'header', name: 'X-Pharme-CSRF', required: false, schema: { type: 'string', example: '1' } })
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, () => createSwaggerDocument(app), {
    jsonDocumentUrl: '/openapi.json',
    swaggerOptions: { withCredentials: true },
  });
}
