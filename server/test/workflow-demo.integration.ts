import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';

test('demo deficit, reservation, dispatch and receipt through the role APIs', async t => {
  const url = new URL(process.env.DEMO_DATABASE_URL ?? '');
  assert.equal(url.hostname, '127.0.0.1');
  assert(url.pathname.endsWith('_demo'));
  const password = process.env.DEMO_USER_PASSWORD;
  assert(password, 'Seed the demo workflow accounts first');
  process.env.DATABASE_URL = url.href;
  process.env.EMAIL_ENABLED = 'false';
  process.env.AUTH_SMTP_URL = '';
  process.env.AUTH_REDIS_PREFIX = 'pharme:demo-test:' + randomUUID();
  const origin = process.env.AUTH_ORIGIN = 'http://localhost:3000';
  const db = new PrismaClient();
  t.after(() => db.$disconnect());
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  t.after(() => app.close());
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  const base = (await app.getUrl()) + '/api/v1';
  const request = (path: string, cookie?: string, body?: object) => fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { Origin: origin, 'X-Pharme-CSRF': '1', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body && JSON.stringify(body),
  });
  async function login(person: string) {
    const reply = await request('/auth/login', undefined, { email: person + '@example.invalid', password });
    assert.equal(reply.status, 200, person);
    const cookie = reply.headers.getSetCookie().find(header => header.startsWith('__Host-pharme-session='))?.split(';')[0];
    assert(cookie);
    return cookie;
  }
  const manager = await login('olena.koval');
  const head = await login('mariia.shevchenko');
  const risks = await request('/risks', manager);
  assert.equal(risks.status, 200);
  const { run, items } = await risks.json() as { run: { id: number }; items: unknown[] };
  assert(run && items.length);
  const generate = await request('/recommendations/generate/' + run.id, manager, {});
  assert.equal(generate.status, 200);
  const queue = await request('/recommendations', manager);
  assert.equal(queue.status, 200);
  const listed = await queue.json() as { status: string; forecastId: number | null }[];
  const forecasts = await db.forecast.findMany({ where: { runId: run.id }, select: { forecastId: true } });
  const currentIds = new Set(forecasts.map(row => row.forecastId));
  const created = listed.filter(row => row.status === 'CREATED');
  assert(created.length > 0 && created.every(row => row.forecastId !== null && currentIds.has(row.forecastId)));
  const transfer = await db.recommendation.findFirstOrThrow({
    where: { status: 'CREATED', forecast: { runId: run.id }, recipientStock: { pharmacy: { code: 'SYN-DEV-001' } },
      donorStock: { pharmacy: { code: { in: ['SYN-DEV-002', 'SYN-DEV-003'] } }, drug: { registrationId: { not: null } } } },
    orderBy: { priority: 'asc' }, include: { donorStock: { include: { pharmacy: true, drug: true } }, recipientStock: true },
  });
  const logist = await login(transfer.donorStock.pharmacy.code === 'SYN-DEV-002' ? 'andrii.melnyk' : 'taras.bondar');
  const path = '/recommendations/' + transfer.recommendationId;
  const act = (command: string, cookie: string) => request(path + '/actions/' + command, cookie,
    command === 'RECEIVE' ? { quantity: transfer.quantity } : {});
  const donorBefore = transfer.donorStock;
  const recipientBefore = transfer.recipientStock;
  const stock = (stockId: number) => db.stockItem.findUniqueOrThrow({ where: { stockId } });
  assert.equal((await act('CONFIRM', logist)).status, 404);
  assert.equal((await act('CONFIRM', manager)).status, 200);
  assert.equal((await stock(donorBefore.stockId)).reservedQuantity, donorBefore.reservedQuantity + transfer.quantity);
  assert.equal((await request(path, logist)).status, 200);
  assert.equal((await act('DISPATCH', logist)).status, 200);
  assert.equal((await stock(donorBefore.stockId)).quantity, donorBefore.quantity);
  assert.equal((await act('RECEIVE', head)).status, 200);
  assert.equal((await act('RECEIVE', head)).status, 200);
  assert.equal((await stock(donorBefore.stockId)).quantity, donorBefore.quantity - transfer.quantity);
  assert.equal((await stock(donorBefore.stockId)).reservedQuantity, donorBefore.reservedQuantity);
  assert.equal((await stock(recipientBefore.stockId)).quantity, recipientBefore.quantity + transfer.quantity);
  const complete = await db.recommendation.findUniqueOrThrow({ where: { recommendationId: transfer.recommendationId } });
  assert.equal(complete.status, 'COMPLETED');
  t.diagnostic(JSON.stringify({ recommendation: complete.recommendationId, sku: donorBefore.drug.sku,
    drug: donorBefore.drug.name, moved: transfer.quantity, distanceSource: complete.distanceSource,
    distanceKm: complete.distanceKm, donorBefore: donorBefore.quantity, donorAfter: donorBefore.quantity - transfer.quantity,
    recipientBefore: recipientBefore.quantity, recipientAfter: recipientBefore.quantity + transfer.quantity }));
});
