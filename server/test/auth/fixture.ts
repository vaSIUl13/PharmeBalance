import type { TestContext } from 'node:test';
import { PrismaService } from '../../src/database/prisma.service';
import type { UserAccount } from '@prisma/client';

import assert = require('node:assert/strict');
import { randomBytes, argon2Sync } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { createClient } from 'redis';
import { AppModule } from '../../src/app.module';
import { setupSwagger } from '../../src/config/swagger';

interface RequestOptions {
  method?: string;
  body?: unknown;
  cookies?: string;
  csrf?: boolean;
}

export async function createFixture(t: TestContext) {
  assert(process.env.AUTH_TEST_DATABASE_URL, 'Set AUTH_TEST_DATABASE_URL to a migrated test database');
  assert(process.env.AUTH_TEST_REDIS_URL, 'Set AUTH_TEST_REDIS_URL to the test Redis instance');
  assert.match(new URL(process.env.AUTH_TEST_DATABASE_URL).pathname, /_test$/);
  process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL;
  process.env.REDIS_URL = process.env.AUTH_TEST_REDIS_URL;
  const run = randomBytes(5).toString('hex');
  process.env.AUTH_REDIS_PREFIX = 'pharme:test:' + run;
  process.env.AUTH_MFA_KEY = randomBytes(32).toString('base64');
  const origin = 'https://pharme.test';
  process.env.AUTH_ORIGIN = origin;
  process.env.EMAIL_ENABLED = 'false';
  delete process.env.AUTH_SMTP_URL;

  const db = new PrismaService();
  const redis = createClient({ url: process.env.REDIS_URL, socket: { reconnectStrategy: false, connectTimeout: 1000 } });
  redis.on('error', () => {});
  t.after(async () => {
    if (redis.isReady) {
      for await (const keys of redis.scanIterator({ MATCH: process.env.AUTH_REDIS_PREFIX + ':*' })) {
        if (keys.length) await redis.del(keys);
      }
    }
    if (redis.isOpen) redis.destroy();
    await db.$disconnect();
  });
  await redis.connect();
  await redis.ping();
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  t.after(() => app.close());
  app.setGlobalPrefix('api/v1');
  setupSwagger(app);
  await app.listen(0, '127.0.0.1');
  const root = (await app.getUrl()) + '/api/v1';
  const password = 'integration-test-password';
  const nextPassword = 'integration-new-password';

  const accounts: Record<string, Pick<UserAccount, 'userId' | 'email' | 'roleId' | 'passwordHash'>> = {};
  const pharmacyIds: number[] = [];
  const managedIds: number[] = [];
  const drugIds: number[] = [];
  const stockIds: number[] = [];
  const transferIds: number[] = [];
  const forecastRunIds: number[] = [];
  t.after(async () => {
    const ids = Object.values(accounts).map((user) => user.userId);
    await db.recommendationAction.deleteMany({ where: { recommendationId: { in: transferIds } } });
    await db.recommendationAction.deleteMany({ where: { recommendation: { forecast: { runId: { in: forecastRunIds } } } } });
    await db.recommendation.deleteMany({ where: { forecast: { runId: { in: forecastRunIds } } } });
    await db.forecast.deleteMany({ where: { runId: { in: forecastRunIds } } });
    await db.forecastRun.deleteMany({ where: { id: { in: forecastRunIds } } });
    await db.sale.deleteMany({ where: { import: { uploadedBy: { in: ids } } } });
    await db.importBatch.deleteMany({ where: { uploadedBy: { in: ids } } });
    await db.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await db.authAuditEvent.deleteMany({ where: { userId: { in: ids } } });
    await db.userPharmacy.deleteMany({ where: { userId: { in: ids } } });
    await db.userAccount.deleteMany({ where: { userId: { in: ids } } });
    await db.recommendation.deleteMany({ where: { recommendationId: { in: transferIds } } });
    await db.stockItem.deleteMany({ where: { stockId: { in: stockIds } } });
    await db.drug.deleteMany({ where: { drugId: { in: drugIds } } });
    await db.pharmacy.deleteMany({ where: { pharmacyId: { in: [...pharmacyIds, ...managedIds] } } });
  });

  for (const role of ['admin', 'manager', 'head', 'logist']) {
    const email = role + '.' + run + '@example.com';
    const nonce = randomBytes(16);
    const key = argon2Sync('argon2id', { nonce, message: Buffer.from(password), memory: 19456, passes: 2, parallelism: 1, tagLength: 32 });
    const encode = (bytes: Buffer) => bytes.toString('base64').replace(/=+$/, '');
    accounts[role] = await db.userAccount.create({ data: {
      email, login: role + '-' + run, firstName: role, lastName: 'Test',
      role: { connect: { code: role } },
      passwordHash: ['$argon2id$v=19$m=19456,t=2,p=1', encode(nonce), encode(key)].join('$'),
    } });
  }

  async function request(path: string, { method = 'GET', body, cookies, csrf = true }: RequestOptions = {}) {
    return fetch(root + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookies ? { Cookie: cookies } : {}),
        ...(csrf ? { Origin: origin, 'X-Pharme-CSRF': '1' } : { Origin: 'https://other.test' }),
        'User-Agent': 'Integration Test',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  const cookie = (response: Response, prefix = '__Host-pharme-session=') =>
    response.headers.getSetCookie().find((header) => header.startsWith(prefix))?.split(';')[0];
  const login = (role: string, value = password, csrf = true) =>
    request('/auth/login', { method: 'POST', body: { email: accounts[role].email, password: value }, csrf });
  return { baseUrl: await app.getUrl(), origin, root, db, redis, run, accounts, password, nextPassword,
    pharmacyIds, managedIds, drugIds, stockIds, transferIds, forecastRunIds, request, cookie, login };
}


export type Fixture = Awaited<ReturnType<typeof createFixture>>;
export type SignedInFixture = Fixture & { admin: string; head: string };
export type TransferFixture = SignedInFixture & { manager: string };
