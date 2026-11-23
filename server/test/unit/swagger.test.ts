import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { createSwaggerDocument } from '../../src/swagger/setup';

test('OpenAPI describes session access, stock schemas, multipart imports and binary reports', async (t) => {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  t.after(() => app.close());
  app.setGlobalPrefix('api/v1');
  const { paths, security, components } = createSwaggerDocument(app);

  assert.deepEqual(security, [{ '__Host-pharme-session': [] }]);
  const cookie = components?.securitySchemes?.['__Host-pharme-session'];
  assert.ok(cookie && 'type' in cookie);
  assert.equal(cookie.type, 'apiKey');
  assert.equal(cookie.in, 'cookie');
  assert.deepEqual(paths['/api/v1/health'].get?.security, []);
  assert.deepEqual(paths['/api/v1/auth/login'].post?.security, []);
  assert.equal(paths['/api/v1/auth/me'].get?.security, undefined);

  for (const [path, item] of Object.entries(paths)) {
    for (const method of ['get', 'post', 'patch', 'delete'] as const) {
      const operation = item[method];
      if (!operation) continue;
      assert.ok(operation.summary, method + ' ' + path);
      assert.ok(operation.tags?.length, method + ' ' + path);
      assert.ok(operation.operationId, method + ' ' + path);
      assert.ok(operation.parameters?.some((param) =>
        'name' in param && param.in === 'header' && param.name === 'X-Pharme-CSRF'));
    }
  }

  const stock = paths['/api/v1/stocks'].post;
  assert.ok(stock?.requestBody && 'content' in stock.requestBody);
  assert.deepEqual(stock.requestBody.content['application/json'].schema, { $ref: '#/components/schemas/CreateStockDto' });
  assert.ok(components?.schemas?.CreateStockDto);
  for (const code of [400, 404, 409]) assert.ok(stock.responses[code]);

  for (const type of ['sales', 'stocks']) {
    const upload = paths['/api/v1/imports/' + type].post;
    assert.ok(upload?.requestBody && 'content' in upload.requestBody);
    const schema = upload.requestBody.content['multipart/form-data'].schema;
    assert.ok(schema && 'properties' in schema);
    const file = schema.properties?.file;
    assert.ok(file && 'format' in file);
    assert.equal(file.format, 'binary');
    assert.deepEqual(schema.required, type === 'stocks' ? ['file', 'pharmacyId', 'snapshotAt'] : ['file', 'pharmacyId']);
    assert.ok(upload.responses[422]);
  }

  const download = paths['/api/v1/reports/export'].get?.responses[200];
  assert.ok(download && 'content' in download);
  for (const mediaType of ['text/csv; charset=utf-8', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) {
    assert.deepEqual(download.content?.[mediaType].schema, { type: 'string', format: 'binary' });
  }
});
