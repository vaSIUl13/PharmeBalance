import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';
import { AuthRedisService } from '../../src/modules/auth/auth-redis.service';
import { HttpMetricsService } from '../../src/modules/health/http-metrics.service';
import { ForecastMetrics } from '../../src/modules/forecasts/forecast-metrics';

function configure(t: TestContext, key: string, value: string) {
  const previous = process.env[key];
  process.env[key] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
}

test('health stays compatible and readiness checks PostgreSQL and Redis', async (t) => {
  configure(t, 'EMAIL_ENABLED', 'false');
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  t.after(() => app.close());
  app.setGlobalPrefix('api/v1');
  const db = t.mock.fn(async () => {});
  app.get(PrismaService).ping = db;
  const redis = t.mock.method(app.get(AuthRedisService), 'ping', async () => undefined);
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();

  assert.deepEqual(await (await fetch(base + '/api/v1/health')).json(), { status: 'ok' });
  const ready = await fetch(base + '/api/v1/health/ready');
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: 'ok' });
  assert.equal(db.mock.callCount(), 1);
  assert.equal(redis.mock.callCount(), 1);

  redis.mock.mockImplementationOnce(async () => { throw new Error('internal connection details'); });
  const unavailable = await fetch(base + '/api/v1/health/ready');
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { status: 'unavailable' });
  assert.equal((await fetch(base + '/api/v1/health')).status, 200);
  assert.equal((await fetch(base + '/api/v1/health/ready')).status, 200);

  db.mock.mockImplementationOnce(async () => { throw new Error('internal connection details'); });
  assert.equal((await fetch(base + '/api/v1/health/ready')).status, 503);
  const stuck = Promise.withResolvers<void>();
  db.mock.mockImplementationOnce(() => stuck.promise);
  const calls = db.mock.callCount();
  try {
    const request = () => fetch(base + '/api/v1/health/ready', { signal: AbortSignal.timeout(3500) });
    const [first, second] = await Promise.all([request(), request()]);
    assert.equal(first.status, 503);
    assert.equal(second.status, 503);
    assert.equal(db.mock.callCount(), calls + 1);
  } finally {
    stuck.resolve();
  }
  assert.equal((await fetch(base + '/api/v1/health/ready')).status, 200);
});

test('Prometheus metrics require credentials and label routes without path parameters', async (t) => {
  const token = 'unit-test-metrics-token';
  configure(t, 'METRICS_TOKEN', token);
  configure(t, 'EMAIL_ENABLED', 'false');
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  t.after(() => app.close());
  app.setGlobalPrefix('api/v1');
  app.use(app.get(HttpMetricsService).observe);
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();

  assert.equal((await fetch(base + '/api/v1/metrics')).status, 404);
  assert.equal((await fetch(base + '/api/v1/metrics', { headers: { Authorization: 'Bearer invalid-token' } })).status, 404);
  assert.equal((await fetch(base + '/api/v1/recommendations/9472848')).status, 401);
  assert.equal((await fetch(base + '/unmatched/111994')).status, 404);
  const stats = await fetch(base + '/api/v1/metrics', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(stats.status, 200);
  assert.match(stats.headers.get('Content-Type') ?? '', /text\/plain/);
  const body = await stats.text();
  assert.match(body, /route="\/api\/v1\/recommendations\/:id"[^\n]*status="401"/);
  assert.match(body, /route="unmatched"[^\n]*status="404"/);
  assert.doesNotMatch(body, /9472848|111994|unit-test-metrics-token/);
});

test('worker metrics distinguish successful and failed cycles and retain forecast freshness', () => {
  const metrics = new ForecastMetrics();
  metrics.succeeded(1.5, '2026-11-24', new Date('2026-11-24T18:00:00.000Z'));
  metrics.failed(2);
  const body = metrics.collect();
  assert.match(body, /pharmabalance_forecast_cycle_duration_seconds_count\{status="success"\} 1/);
  assert.match(body, /pharmabalance_forecast_cycle_duration_seconds_count\{status="error"\} 1/);
  assert.match(body, /pharmabalance_forecast_last_success_timestamp_seconds 1795543200/);
  assert.match(body, /pharmabalance_forecast_data_timestamp_seconds 1795478400/);
});
