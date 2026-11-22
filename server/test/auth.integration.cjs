require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, argon2Sync } = require('node:crypto');
const { test } = require('node:test');
const { createServer } = require('node:net');
const { NestFactory } = require('@nestjs/core');
const { PrismaClient } = require('@prisma/client');
const { createClient } = require('redis');
const { authenticator } = require('otplib');
const { AppModule } = require('../dist/app.module');
const { setupSwagger } = require('../dist/config/swagger');
const { digest, encryptMfa } = require('../dist/modules/auth/auth-security');

async function captureResetMail(send) {
  let delivered;
  const received = new Promise((resolve) => { delivered = resolve; });
  const connections = new Set();
  const smtp = createServer((socket) => {
    connections.add(socket);
    socket.on('close', () => connections.delete(socket));
    socket.setEncoding('utf8');
    socket.write('220 localhost test SMTP\r\n');
    let buffer = '';
    let text = '';
    let receiving = false;
    socket.on('data', (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (receiving) {
          if (line === '.') {
            receiving = false;
            socket.write('250 accepted\r\n');
            delivered(text);
          } else text += line + '\r\n';
        } else if (line === 'DATA') {
          receiving = true;
          socket.write('354 end with dot\r\n');
        } else if (line === 'QUIT') {
          socket.end('221 goodbye\r\n');
        } else {
          socket.write('250 localhost\r\n');
        }
      }
    });
  });
  await new Promise((resolve) => smtp.listen(0, '127.0.0.1', resolve));
  process.env.AUTH_SMTP_URL = 'smtp://127.0.0.1:' + smtp.address().port;
  process.env.AUTH_MAIL_FROM = 'test@example.com';
  let timer;
  try {
    await send();
    return await Promise.race([received, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Reset email was not received')), 8000);
    })]);
  } finally {
    clearTimeout(timer);
    delete process.env.AUTH_SMTP_URL;
    delete process.env.AUTH_MAIL_FROM;
    for (const connection of connections) connection.destroy();
    await new Promise((resolve) => smtp.close(resolve));
  }
}

test('auth against PostgreSQL and Redis', async (t) => {
  assert(process.env.AUTH_TEST_DATABASE_URL, 'Set AUTH_TEST_DATABASE_URL to a migrated test database');
  assert(process.env.AUTH_TEST_REDIS_URL, 'Set AUTH_TEST_REDIS_URL to the test Redis instance');
  assert.match(new URL(process.env.AUTH_TEST_DATABASE_URL).pathname, /_test$/);
  process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL;
  process.env.REDIS_URL = process.env.AUTH_TEST_REDIS_URL;
  const run = randomBytes(5).toString('hex');
  process.env.AUTH_REDIS_PREFIX = 'pharme:test:' + run;
  process.env.AUTH_MFA_KEY = randomBytes(32).toString('base64');
  process.env.AUTH_ORIGIN = 'https://pharme.test';
  delete process.env.AUTH_SMTP_URL;

  const db = new PrismaClient();
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
  const docs = await fetch((await app.getUrl()) + '/docs');
  assert.equal(docs.status, 200);
  assert.match(await docs.text(), /swagger-ui/);
  const specResponse = await fetch((await app.getUrl()) + '/openapi.json');
  assert.equal(specResponse.status, 200);
  const spec = await specResponse.json();
  for (const route of ['stocks', 'sales']) {
    const form = spec.paths['/api/v1/imports/' + route].post.requestBody.content['multipart/form-data'].schema;
    assert.equal(form.properties.file.format, 'binary');
    assert(form.required.includes('pharmacyId'));
  }
  for (const path of ['/roles', '/users', '/audit', '/pharmacies']) {
    assert.ok(spec.paths['/api/v1' + path].get);
  }
  assert.ok(spec.paths['/api/v1/users'].post.requestBody);
  assert.ok(spec.paths['/api/v1/users/{id}'].patch.requestBody);
  assert.ok(spec.paths['/api/v1/pharmacies/{id}'].get);
  assert.deepEqual(spec.paths['/api/v1/auth/login'].post.security, []);
  assert.deepEqual(spec.paths['/api/v1/health'].get.security, []);
  assert.deepEqual(spec.security, [{ '__Host-pharme-session': [] }]);
  const password = 'integration-test-password';
  const nextPassword = 'integration-new-password';

  const accounts = {};
  const pharmacyIds = [];
  const managedIds = [];
  const drugIds = [];
  const stockIds = [];
  const transferIds = [];
  const forecastRunIds = [];
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
    const encode = (bytes) => bytes.toString('base64').replace(/=+$/, '');
    accounts[role] = await db.userAccount.create({ data: {
      email, login: role + '-' + run, firstName: role, lastName: 'Test',
      role: { connect: { code: role } },
      passwordHash: ['$argon2id$v=19$m=19456,t=2,p=1', encode(nonce), encode(key)].join('$'),
    } });
  }

  async function request(path, { method = 'GET', body, cookies, csrf = true } = {}) {
    return fetch(root + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookies ? { Cookie: cookies } : {}),
        ...(csrf ? { Origin: process.env.AUTH_ORIGIN, 'X-Pharme-CSRF': '1' } : { Origin: 'https://other.test' }),
        'User-Agent': 'Integration Test',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  const cookie = (response, prefix = '__Host-pharme-session=') =>
    response.headers.getSetCookie().find((header) => header.startsWith(prefix))?.split(';')[0];
  const login = (role, value = password, csrf = true) =>
    request('/auth/login', { method: 'POST', body: { email: accounts[role].email, password: value }, csrf });

  let admin;
  let head;
  let manager;
  await t.test('CSRF, legacy hash upgrade, secure cookies and parallel requests', async () => {
    assert.equal((await login('head', password, false)).status, 403);
    assert.equal((await login('head', 'wrong-password')).status, 401);
    const response = await login('head');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /HttpOnly.*Secure.*SameSite=Lax/i);
    head = cookie(response);
    const user = await db.userAccount.findUniqueOrThrow({ where: { userId: accounts.head.userId } });
    assert.match(user.passwordHash, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    const concurrent = await Promise.all(Array.from({ length: 6 }, () => request('/auth/me', { cookies: head })));
    assert(concurrent.every((result) => result.status === 200 && !result.headers.has('set-cookie')));
  });

  await t.test('admin challenge, successful TOTP, and rejection of TOTP reuse', async () => {
    assert.equal((await login('admin')).status, 403);
    const secret = authenticator.generateSecret(20);
    const backup = randomBytes(16).toString('base64url');
    await db.authMfa.create({ data: {
      userId: accounts.admin.userId, encryptedSecret: encryptMfa(secret, accounts.admin.userId), recoveryHashes: [digest(backup)],
    } });
    const first = await login('admin');
    assert.equal(first.status, 200);
    assert.equal((await first.json()).mfaRequired, true);
    assert.equal(cookie(first), undefined);
    const pending = cookie(first, '__Host-pharme-mfa=');
    assert.equal((await request('/auth/me', { cookies: pending })).status, 401);
    const code = authenticator.generate(secret);
    const finish = (cookies) => request('/auth/mfa/verify', { method: 'POST', body: { code }, cookies });
    const verified = await finish(pending);
    assert.equal(verified.status, 204);
    admin = cookie(verified);
    assert.equal((await finish(pending)).status, 401);
    const second = await login('admin');
    assert.equal((await finish(cookie(second, '__Host-pharme-mfa='))).status, 401);
    const third = await login('admin');
    const thirdPending = cookie(third, '__Host-pharme-mfa=');
    const recovery = (cookies) => request('/auth/mfa/verify', {
      method: 'POST', body: { code: backup }, cookies,
    });
    assert.equal((await recovery(thirdPending)).status, 204);
    const fourth = await login('admin');
    assert.equal((await recovery(cookie(fourth, '__Host-pharme-mfa='))).status, 401);
  });

  await t.test('administrators assign exactly one head, activate and audit a managed pharmacy', async () => {
    const created = await request('/pharmacies', { method: 'POST', cookies: admin, body: {
      code: 'M' + run, name: 'Managed', city: 'Test', address: 'Test', latitude: 49, longitude: 24,
    } });
    assert.equal(created.status, 201);
    const { pharmacyId, isActive } = await created.json();
    managedIds.push(pharmacyId);
    assert.equal(isActive, false);
    const body = { login: 'new-' + run, email: run + '@example.invalid', firstName: 'New',
      lastName: 'Head', password, role: 'manager' };
    const create = (cookies, data) => request('/users', { method: 'POST', cookies, body: data });
    assert.equal((await create(head, body)).status, 403);
    assert.equal((await create(admin, { ...body, role: 'head' })).status, 400);
    const user = await create(admin, body);
    assert.equal(user.status, 201);
    accounts.newHead = await user.json();
    assert.equal(accounts.newHead.passwordHash, undefined);
    assert.equal((await create(admin, body)).status, 409);
    const session = cookie(await login('newHead'));
    const assign = (id) => request('/users/' + id, { method: 'PATCH', cookies: admin, body: { role: 'head', pharmacyId } });
    const attempts = await Promise.all([assign(accounts.newHead.userId), assign(accounts.newHead.userId)]);
    assert.deepEqual(attempts.map(r => r.status), [200, 200]);
    assert.equal((await assign(accounts.manager.userId)).status, 409);
    const directory = await request('/users?after=' + (accounts.newHead.userId - 1), { cookies: admin });
    assert.equal(directory.status, 200);
    const listed = (await directory.json()).items[0];
    assert.equal(listed.userId, accounts.newHead.userId);
    assert.equal(listed.role.code, 'head');
    assert.deepEqual(listed.pharmacyIds, [pharmacyId]);
    assert.equal(listed.passwordHash, undefined);
    const roles = await request('/roles', { cookies: admin });
    assert.equal(roles.status, 200);
    assert.deepEqual((await roles.json()).map(role => role.code), ['admin', 'head', 'logist', 'manager']);
    for (const route of ['/roles', '/users', '/audit']) {
      assert.equal((await request(route, { cookies: session })).status, 403);
    }
    for (const route of ['/users?after=-1', '/audit?before=oops']) {
      assert.equal((await request(route, { cookies: admin })).status, 400);
    }
    const visible = await (await request('/pharmacies', { cookies: session })).json();
    assert.deepEqual(visible.items.map(p => [p.pharmacyId, p.isActive]), [[pharmacyId, true]]);
    assert.equal((await request('/pharmacies/' + pharmacyId, { cookies: session })).status, 200);
    assert.equal((await request('/pharmacies/' + pharmacyId, { cookies: head })).status, 404);
    const events = await db.auditLog.findMany({ where: { targetUserId: accounts.newHead.userId }, orderBy: { logId: 'asc' } });
    assert.deepEqual(events.map(e => e.eventType), ['ACCOUNT_CREATED', 'ROLE_CHANGED', 'PHARMACY_ASSIGNED', 'REFERENCE_EDITED']);
    assert.equal((await request('/users/' + accounts.newHead.userId + '/block', { method: 'POST', cookies: admin })).status, 204);
    const history = await request('/audit?targetUserId=' + accounts.newHead.userId, { cookies: admin });
    assert.equal(history.status, 200);
    const log = (await history.json()).items;
    assert.deepEqual(log.map(row => row.eventType), ['ACCOUNT_BLOCKED', 'REFERENCE_EDITED', 'PHARMACY_ASSIGNED',
      'REFERENCE_EDITED', 'PHARMACY_ASSIGNED', 'ROLE_CHANGED', 'ACCOUNT_CREATED']);
    assert(log.every(row => row.userId === accounts.admin.userId && row.targetUserId === accounts.newHead.userId));
    assert.equal((await db.pharmacy.findUniqueOrThrow({ where: { pharmacyId } })).isActive, false);
    const candidates = [1, 2].map(i => ({ ...body, role: 'head', pharmacyId,
      login: 'candidate-' + i + run, email: 'candidate-' + i + run + '@example.invalid' }));
    const race = await Promise.all(candidates.map(candidate => create(admin, candidate)));
    for (const [i, response] of race.entries()) {
      if (response.status === 201) accounts['candidate' + i] = await response.json();
    }
    assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
    assert.equal(await db.userAccount.count({ where: { login: { in: candidates.map(c => c.login) } } }), 1);
    assert.equal(await db.userPharmacy.count({ where: { pharmacyId, unassignedAt: null } }), 1);
    assert.equal((await db.pharmacy.findUniqueOrThrow({ where: { pharmacyId } })).isActive, true);
  });

  await t.test('pharmacy and transfer scopes update on the next request', async () => {
    for (let i = 0; i < 2; i++) {
      const pharmacy = await db.pharmacy.create({ data: {
        code: 'A' + run + i, name: 'Test', city: 'Test', address: 'Test',
        latitude: 49, longitude: 24,
      } });
      pharmacyIds.push(pharmacy.pharmacyId);
    }
    const drug = await db.drug.create({ data: { sku: 'AUTH-' + run, name: 'Test', dosageForm: 'Test', unit: 'Test' } });
    drugIds.push(drug.drugId);
    for (const pharmacyId of pharmacyIds) {
      const stock = await db.stockItem.create({ data: { pharmacyId, drugId: drug.drugId, maxLevel: 10 } });
      stockIds.push(stock.stockId);
    }
    const recommendation = await db.recommendation.create({
      data: { donorStockId: stockIds[1], recipientStockId: stockIds[0], quantity: 1, priority: 1, status: 'IN_PROGRESS' },
    });
    transferIds.push(recommendation.recommendationId);
    const scope = { userId: accounts.head.userId, pharmacyId: pharmacyIds[0] };
    const detail = '/recommendations/' + recommendation.recommendationId;
    assert.equal((await request(detail, { cookies: head })).status, 404);
    await db.userPharmacy.create({ data: scope });
    const forecastRun = await db.forecastRun.create({ data: {
      asOf: new Date('2001-01-01'), version: run, synthetic: false, policy: {},
    } });
    forecastRunIds.push(forecastRun.id);
    await db.forecast.createMany({ data: stockIds.map(stockId => ({ stockId, modelVersion: 'fixture',
      runId: forecastRun.id, predictedDemand: 5, shortageProbability: 0.5, currentSurplus: 2 })) });
    for (const endpoint of ['forecasts','risks','classifications','surpluses']) {
      const route = '/' + endpoint + '?asOf=2001-01-01';
      const own = await request(route, { cookies: head });
      assert.equal(own.status, 200);
      assert.deepEqual((await own.json()).items.map(row=>row.stockId), [stockIds[0]]);
      const foreign = await request(route + '&pharmacyId=' + pharmacyIds[1], { cookies: head });
      assert.deepEqual((await foreign.json()).items, []);
      assert.equal((await request(route, { cookies: admin })).status, 403);
    }
    assert.deepEqual((await (await request('/stocks', { cookies: head })).json()).map((row) => row.pharmacyId), [pharmacyIds[0]]);
    assert.equal((await request(detail, { cookies: head })).status, 200);
    const permission = await db.permission.findUniqueOrThrow({ where: { code: 'PHARMACY_VIEW' } });
    const grant = { roleId: accounts.head.roleId, permissionId: permission.permissionId };
    await db.rolePermission.delete({ where: { roleId_permissionId: grant } });
    try {
      assert.deepEqual(await (await request('/stocks', { cookies: head })).json(), []);
    } finally {
      await db.rolePermission.create({ data: grant });
    }
    assert.equal((await request(detail, { cookies: head })).status, 200);
    await db.userPharmacy.update({ where: { userId_pharmacyId: scope }, data: { unassignedAt: new Date() } });
    assert.equal((await request(detail, { cookies: head })).status, 404);
    manager = cookie(await login('manager'));
    assert.equal((await request(detail, { cookies: manager })).status, 200);
    const headRole = await db.role.findUniqueOrThrow({ where: { code: 'head' } });
    await db.userAccount.update({ where: { userId: accounts.manager.userId }, data: { roleId: headRole.roleId } });
    assert.equal((await request(detail, { cookies: manager })).status, 404);
    await db.userAccount.update({ where: { userId: accounts.manager.userId }, data: { roleId: accounts.manager.roleId } });
  });

  await t.test('stock creation, scoped reads and atomic threshold edits', async () => {
    const pharmacyId = pharmacyIds[0];
    const drugs = await db.drug.findMany({ where: { isActive: true, drugId: { notIn: drugIds } },
      orderBy: [{ registrationId: { sort: 'asc', nulls: 'last' } }, { drugId: 'asc' }], take: 2 });
    while (drugs.length < 2) {
      const drug = await db.drug.create({ data: { sku: 'INV-' + run + drugs.length, name: 'Stock fixture', dosageForm: 'tablet', unit: 'pack' } });
      drugs.push(drug);
      drugIds.push(drug.drugId);
    }
    const create = (cookies, body) => request('/stocks', { method: 'POST', cookies, body });
    const base = { pharmacyId, sku: drugs[0].sku, msl: 2, maxLevel: 10, quantity: 12 };
    assert.equal((await create(head, base)).status, 403);
    assert.equal((await create(admin, { ...base, msl: -1 })).status, 400);
    assert.equal((await create(admin, { ...base, sku: 'MISSING-' + run })).status, 404);
    const created = await Promise.all([create(admin, base), create(manager, base)]);
    const success = created.find(r => r.status === 201);
    assert.ok(success);
    const stock = await success.json();
    stockIds.push(stock.stockId);
    assert.deepEqual(created.map(r => r.status).sort(), [201, 409]);
    const second = await create(manager, { pharmacyId, sku: drugs[1].sku, msl: 0, maxLevel: 0 });
    assert.equal(second.status, 201);
    const empty = await second.json();
    stockIds.push(empty.stockId);
    assert.equal(empty.quantity, 0);
    const patch = (cookies, body) => request('/stocks/' + stock.stockId + '/thresholds', { method: 'PATCH', cookies, body });
    assert.equal((await patch(head, { msl: 4 })).status, 403);
    assert.equal((await patch(manager, { maxLevel: 1 })).status, 400);
    assert.equal((await patch(manager, { quantity: 0 })).status, 400);
    const edits = await Promise.all([patch(manager, { msl: 9 }), patch(admin, { maxLevel: 5 })]);
    assert.deepEqual(edits.map(r => r.status).sort(), [200, 400]);
    const final = await patch(admin, { msl: 5, maxLevel: 5 });
    assert.equal(final.status, 200);
    assert.equal((await final.json()).quantity, 12);
    assert.equal((await patch(admin, { msl: 5 })).status, 200);
    assert.equal(await db.auditLog.count({ where: { stockId: stock.stockId, eventType: 'THRESHOLDS_CHANGED' } }), 3);
    const path = '/stocks?pharmacyId=' + pharmacyId + '&sku=' + encodeURIComponent(base.sku);
    assert.deepEqual((await (await request(path, { cookies: admin })).json()).map(row => row.stockId), [stock.stockId]);
    assert.deepEqual(await (await request(path, { cookies: head })).json(), []);
  });

  await t.test('multipart imports enforce assignment, atomicity, replay and correction policy', async () => {
    const pharmacyId = pharmacyIds[0];
    const stock = await db.stockItem.findUniqueOrThrow({ where: { stockId: stockIds[0] }, include: { drug: true } });
    const { sku } = stock.drug;
    const assignment = { userId: accounts.head.userId, pharmacyId };
    await db.userPharmacy.update({ where: { userId_pharmacyId: assignment }, data: { unassignedAt: null } });
    const instant = new Date().toISOString();
    const snapshot = 'sku,quantity\n' + sku + ',17';
    async function upload(type, file, { id = pharmacyId, cookies = head, at = instant, ext = 'csv' } = {}) {
      const form = new FormData();
      form.append('pharmacyId', String(id));
      if (type === 'stocks') form.append('snapshotAt', at);
      form.append('file', new Blob([file]), 'sample.' + ext);
      return fetch(root + '/imports/' + type, { method: 'POST', body: form,
        headers: { Cookie: cookies, Origin: process.env.AUTH_ORIGIN, 'X-Pharme-CSRF': '1' } });
    }
    for (const options of [{ cookies: manager }, { cookies: admin }, { id: pharmacyIds[1] }]) {
      assert.equal((await upload('stocks', snapshot, options)).status, 403);
    }
    assert.equal((await upload('stocks', 'x'.repeat(1024*1024+1))).status, 413);
    const bad = await upload('stocks', snapshot + '\nUNKNOWN-' + run + ',2');
    assert.equal(bad.status, 422);
    assert.equal((await bad.json()).errors[0].row, 2);
    const malformed = await upload('sales', '{', { ext: 'json' });
    assert.equal(malformed.status, 422);
    const rejected = await malformed.json();
    assert.equal(rejected.errors[0].row, 0);
    assert.equal((await (await upload('sales', '{', { ext: 'json' })).json()).importId, rejected.importId);
    assert.equal((await db.stockItem.findUniqueOrThrow({ where: { stockId: stock.stockId } })).quantity, stock.quantity);
    const receipts = await Promise.all([upload('stocks', snapshot), upload('stocks', snapshot)]);
    assert.deepEqual(receipts.map(r => r.status), [200, 200]);
    const [first, repeat] = await Promise.all(receipts.map(r => r.json()));
    assert.equal(first.importId, repeat.importId);
    assert.equal(first.recordsApplied, 1);
    const current = () => db.stockItem.findUniqueOrThrow({ where: { stockId: stock.stockId } });
    assert.equal((await current()).quantity, 17);
    assert.equal((await upload('stocks', snapshot.replace(',17', ',18'))).status, 422);
    assert.equal((await upload('stocks', snapshot, { at: '2020-01-01T00:00:00Z' })).status, 422);
    await db.stockItem.update({ where: { stockId: stock.stockId }, data: { quantity: { decrement: 1 } } });
    assert((await current()).quantityAsOf > new Date(instant));
    assert.equal((await upload('stocks', snapshot + '\n')).status, 422);
    assert.equal((await current()).quantity, 16);
    const date = '2025-03-02';
    const submit = rows => upload('sales', JSON.stringify(rows), { ext: 'json' });
    const row = { sku, date, quantity: 5, unitPrice: '12.50' };
    const sales = await submit([row]);
    assert.equal(sales.status, 200);
    const original = await sales.json();
    assert.equal((await (await submit([row])).json()).importId, original.importId);
    assert.equal((await submit([row, row])).status, 422);
    const mixed = await submit([{ ...row, date: '2025-03-01' }, { ...row, quantity: 25 }]);
    assert.equal(mixed.status, 422);
    assert.equal(await db.sale.count({ where: { stockId: stock.stockId } }), 1);
    assert.equal((await submit([{ ...row, quantity: 2 }])).status, 422);
    const correction = quantity => submit([{ ...row, quantity, replacesImportId: original.importId }]);
    const concurrent = await Promise.all([correction(3), correction(4)]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 422]);
    const saved = await db.sale.findMany({ where: { stockId: stock.stockId } });
    assert.equal(saved.length, 1);
    assert([3, 4].includes(saved[0].quantity));
    assert.equal((await current()).quantity, 16);
    const path = '/imports/' + first.importId;
    assert.equal((await request(path, { cookies: head })).status, 200);
    assert((await (await request('/imports', { cookies: head })).json()).items.some(b => b.importId === first.importId));
    await db.userPharmacy.update({ where: { userId_pharmacyId: assignment }, data: { unassignedAt: new Date() } });
    assert.equal((await request(path, { cookies: head })).status, 404);
    assert.deepEqual((await (await request('/imports', { cookies: head })).json()).items, []);
  });

  await t.test('redistribution reserves at confirmation and moves physical stock at receipt', async () => {
    const [recipientId, donorId] = stockIds;
    const [recipientPharmacy, donorPharmacy] = pharmacyIds;
    const recipient = await db.stockItem.update({ where: { stockId: recipientId }, data: { msl: 20, maxLevel: 30 } });
    const donor = await db.stockItem.update({ where: { stockId: donorId }, data: { quantity: 110, maxLevel: 10 } });
    const current = () => db.stockItem.findMany({ where: { stockId: { in: [recipientId, donorId] } }, orderBy: { stockId: 'asc' } });
    await db.userPharmacy.update({ where: { userId_pharmacyId: { userId: accounts.head.userId, pharmacyId: recipientPharmacy } },
      data: { unassignedAt: null } });
    await db.userPharmacy.create({ data: { userId: accounts.logist.userId, pharmacyId: donorPharmacy } });
    const logist = cookie(await login('logist'));
    const otherPharmacy = await db.pharmacy.create({ data: { code: 'R' + run, name: 'Competing recipient', city: 'Test',
      address: 'Test', latitude: 49.1, longitude: 24 } });
    managedIds.push(otherPharmacy.pharmacyId);
    const other = await db.stockItem.create({ data: { pharmacyId: otherPharmacy.pharmacyId, drugId: recipient.drugId,
      quantity: 0, msl: 1, maxLevel: 10 } });
    stockIds.push(other.stockId);
    const snapshot = await db.forecastRun.create({ data: { asOf: new Date('2099-01-01'), synthetic: false, version: 'transfer-' + run, policy: {} } });
    forecastRunIds.push(snapshot.id);
    const winner = await db.forecast.create({ data: { stockId: recipientId, runId: snapshot.id, modelVersion: run,
      quantity: recipient.quantity, msl: recipient.msl, shortage: 121, predictedDemand: recipient.quantity - recipient.msl + 121 } });
    const loser = await db.forecast.create({ data: { stockId: other.stockId, runId: snapshot.id, modelVersion: run,
      quantity: 0, msl: 1, shortage: 101, predictedDemand: 100 } });
    const post = (path, cookies = manager, body = {}) => request(path, { method: 'POST', cookies, body });
    const generate = '/recommendations/generate/' + snapshot.id;
    const generations = await Promise.all([post(generate), post(generate)]);
    assert.deepEqual(generations.map(r => r.status), [200, 200]);
    assert.deepEqual((await Promise.all(generations.map(r => r.json()))).map(r=>r.created).sort(), [0, 1]);
    const rec = await db.recommendation.findUniqueOrThrow({ where: { forecastId: winner.forecastId } });
    const queue = await request('/recommendations', { cookies: manager });
    assert.equal(queue.status, 200);
    assert.equal((await queue.json())[0].recommendationId, rec.recommendationId);
    assert.equal(rec.quantity, 100);
    assert.equal(Number(rec.uncoveredQuantity), 20);
    assert.equal(rec.donorStockId, donorId);
    assert.equal((await db.forecast.findUniqueOrThrow({ where: { forecastId: loser.forecastId } })).redistributionReason,
      'NO_DONOR_WITH_ENOUGH_SURPLUS');
    const competitor = await db.recommendation.create({ data: { forecastId: loser.forecastId,
      donorStockId: donorId, recipientStockId: other.stockId, quantity: 100, priority: 2 } });
    const act = (code, cookies, body, id = rec.recommendationId) => post('/recommendations/' + id + '/actions/' + code, cookies, body);
    assert.equal((await act('DISPATCH', logist)).status, 404);
    const competition = await Promise.all([act('CONFIRM'), act('CONFIRM', manager, {}, competitor.recommendationId)]);
    assert.deepEqual(competition.map(r => r.status).sort(), [200, 409]);
    const approved = (await db.recommendation.findMany({ where: { forecastId: { in: [winner.forecastId, loser.forecastId] },
      status: 'CONFIRMED' } }))[0];
    assert.equal((await current())[1].reservedQuantity, 100);
    assert.equal((await act('CANCEL', manager, {}, approved.recommendationId)).status, 200);
    assert.equal((await current())[1].reservedQuantity, 0);

    const nextRun = await db.forecastRun.create({ data: { asOf: snapshot.asOf, synthetic: false,
      version: 'next-' + run, policy: {} } });
    forecastRunIds.push(nextRun.id);
    const nextForecast = await db.forecast.create({ data: { stockId: recipientId, runId: nextRun.id, modelVersion: run,
      quantity: recipient.quantity, msl: recipient.msl, shortage: 121, predictedDemand: recipient.quantity - recipient.msl + 121 } });
    assert.equal((await post('/recommendations/generate/' + nextRun.id)).status, 200);
    const transfer = await db.recommendation.findUniqueOrThrow({ where: { forecastId: nextForecast.forecastId } });
    const id = transfer.recommendationId;
    assert.equal((await act('CONFIRM', manager, {}, id)).status, 200);
    assert.equal((await act('RECEIVE', head, { quantity: 100 }, id)).status, 404);
    const initial = (await current()).slice(0, 2).map(s => s.quantity);
    assert.deepEqual((await Promise.all([act('DISPATCH', logist, {}, id), act('DISPATCH', logist, {}, id)])).map(r => r.status), [200, 200]);
    assert.deepEqual((await current()).slice(0, 2).map(s => s.quantity), initial);
    assert.equal((await act('CANCEL', manager, {}, id)).status, 409);
    assert.equal((await act('RECEIVE', head, { quantity: 99 }, id)).status, 400);
    assert.equal((await act('RECEIVE', logist, { quantity: 100 }, id)).status, 403);
    const headAccount = await db.userAccount.findUniqueOrThrow({ where: { userId: accounts.head.userId } });
    accounts.donorHead = await db.userAccount.create({ data: { login: 'donor-' + run, email: 'donor-' + run + '@example.invalid',
      firstName: 'Donor', lastName: 'Head', roleId: headAccount.roleId, passwordHash: headAccount.passwordHash } });
    await db.userPharmacy.create({ data: { userId: accounts.donorHead.userId, pharmacyId: donorPharmacy } });
    const donorSession = cookie(await login('donorHead'));
    assert.equal((await act('RECEIVE', donorSession, { quantity: 100 }, id)).status, 404);
    const sku = (await db.drug.findUniqueOrThrow({ where: { drugId: donor.drugId } })).sku;
    const snapshotAt = new Date().toISOString();
    const importStock = async () => {
      const form = new FormData();
      form.set('pharmacyId', String(donorPharmacy));
      form.set('snapshotAt', snapshotAt);
      form.set('file', new Blob(['sku,quantity\n' + sku + ',99']), 'older.csv');
      return fetch(root + '/imports/stocks', { method: 'POST', body: form, headers: {
        Cookie: donorSession, Origin: process.env.AUTH_ORIGIN, 'X-Pharme-CSRF': '1',
      } });
    };
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual((await Promise.all([act('RECEIVE', head, { quantity: 100 }, id),
      act('RECEIVE', head, { quantity: 100 }, id), importStock()])).map(r => r.status), [200, 200, 422]);
    assert.deepEqual((await current()).slice(0, 2).map(s => [s.quantity, s.reservedQuantity]),
      [[recipient.quantity + 100, 0], [donor.quantity - 100, 0]]);
    const history = await request('/recommendations/' + id + '/history', { cookies: manager });
    assert.deepEqual((await history.json()).map(a => [a.actionType.code, a.quantity, a.userId]),
      [['CONFIRM', 100, accounts.manager.userId], ['DISPATCH', 100, accounts.logist.userId], ['RECEIVE', 100, accounts.head.userId]]);
    const fresh = await db.forecastRun.create({ data: { asOf: snapshot.asOf, synthetic: false, version: 'stale-' + run, policy: {} } });
    forecastRunIds.push(fresh.id);
    const beforeImport = (await current())[0];
    const sample = await db.forecast.create({ data: { stockId: recipientId, runId: fresh.id, modelVersion: run,
      quantity: beforeImport.quantity, msl: beforeImport.msl, predictedDemand: 200 } });
    const stale = await db.recommendation.create({ data: { forecastId: sample.forecastId, donorStockId: donorId,
      recipientStockId: recipientId, quantity: 1, priority: 1 } });
    const validStock = new FormData();
    validStock.set('pharmacyId', String(recipientPharmacy));
    validStock.set('snapshotAt', new Date().toISOString());
    validStock.set('file', new Blob(['sku,quantity\n' + sku + ',' + (beforeImport.quantity + 1)]), 'new.csv');
    assert.equal((await fetch(root + '/imports/stocks', { method: 'POST', body: validStock, headers: {
      Cookie: head, Origin: process.env.AUTH_ORIGIN, 'X-Pharme-CSRF': '1',
    } })).status, 200);
    assert.equal((await act('CONFIRM', manager, {}, stale.recommendationId)).status, 409);
    assert.equal((await db.recommendation.findUniqueOrThrow({ where: { recommendationId: stale.recommendationId } })).status, 'STALE');
    await db.recommendationAction.deleteMany({ where: { recommendationId: id } });
    await db.userPharmacy.update({ where: { userId_pharmacyId: { userId: accounts.head.userId, pharmacyId: recipientPharmacy } },
      data: { unassignedAt: new Date() } });
  });

  await t.test('selected session revocation, ownership checks, and logout all', async () => {
    const second = cookie(await login('head'));
    const sessions = await (await request('/auth/sessions', { cookies: head })).json();
    assert.equal(sessions.length, 2);
    assert.equal(sessions.filter((entry) => entry.current).length, 1);
    assert(sessions.every((entry) => entry.device === 'Integration Test' && entry.lastSeenAt && !entry.tokenHash));
    const other = sessions.find((entry) => !entry.current);
    assert.equal((await request('/auth/sessions/' + other.id, { method: 'DELETE', cookies: manager })).status, 204);
    assert.equal((await request('/auth/me', { cookies: second })).status, 200);
    assert.equal((await request('/auth/sessions/' + other.id, { method: 'DELETE', cookies: head })).status, 204);
    assert.equal((await request('/auth/me', { cookies: second })).status, 401);
    assert.equal((await request('/auth/logout-all', { method: 'POST', cookies: head })).status, 204);
    assert.equal((await request('/auth/me', { cookies: head })).status, 401);
  });

  await t.test('password reset is single-use and revokes existing sessions', async () => {
    const email = await captureResetMail(async () => {
      const response = await request('/auth/password/reset-request', {
        method: 'POST', body: { email: accounts.manager.email },
      });
      assert.equal(response.status, 204);
    });
    const resetToken = email.replace(/=\r?\n/g, '').replace(/=3D/g, '=').match(/#token=([A-Za-z0-9_-]{43})/)?.[1];
    assert(resetToken);
    const stored = await db.authChallenge.findUniqueOrThrow({ where: { tokenHash: digest(resetToken) } });
    assert.equal(stored.userId, accounts.manager.userId);
    const reset = () => request('/auth/password/reset', { method: 'POST', body: { token: resetToken, newPassword: nextPassword } });
    const results = await Promise.all([reset(), reset()]);
    assert.deepEqual(results.map((res) => res.status).sort(), [204, 401]);
    assert.equal((await request('/auth/me', { cookies: manager })).status, 401);
    assert.equal((await login('manager', password)).status, 401);
    manager = cookie(await login('manager', nextPassword));
    assert(manager);
  });

  await t.test('permissions protect blocking, admin blocking revokes sessions, Redis limits attempts', async () => {
    const route = '/users/' + accounts.manager.userId + '/block';
    assert.equal((await request(route, { method: 'POST', cookies: manager })).status, 403);
    assert.equal((await request(route, { method: 'POST', cookies: admin })).status, 204);
    assert.equal((await request('/auth/me', { cookies: manager })).status, 401);
    for (let i = 0; i < 5; i++) assert.equal((await login('manager', nextPassword)).status, 401);
    assert.equal((await login('manager', nextPassword)).status, 429);
    const events = await db.authAuditEvent.findMany({ where: { userId: accounts.manager.userId } });
    assert(events.some((event) => event.event === 'ACCOUNT_BLOCKED'));
  });

  await t.test('password change revokes all sessions and preserves the replacement hash', async () => {
    const first = cookie(await login('head'));
    const second = cookie(await login('head'));
    const change = await request('/auth/password/change', {
      method: 'POST', cookies: first, body: { currentPassword: password, newPassword: nextPassword },
    });
    assert.equal(change.status, 204);
    assert.equal((await request('/auth/me', { cookies: first })).status, 401);
    assert.equal((await request('/auth/me', { cookies: second })).status, 401);
    const fresh = cookie(await login('head', nextPassword));
    assert(fresh);
    const refreshed = await request('/auth/login', {
      method: 'POST', cookies: fresh, body: { email: accounts.head.email, password: nextPassword },
    });
    const replacement = cookie(refreshed);
    assert.notEqual(replacement, fresh);
    assert.equal((await request('/auth/me', { cookies: fresh })).status, 401);
    assert.equal((await request('/auth/me', { cookies: replacement })).status, 200);
  });

  await t.test('session revocation survives Redis eviction and administrator idle timeout is enforced', async () => {
    const managerHash = digest(manager.split('=')[1]);
    const key = process.env.AUTH_REDIS_PREFIX + ':revoked:' + managerHash;
    assert.equal(await redis.exists(key), 1);
    await redis.del(key);
    assert.equal((await request('/auth/me', { cookies: manager })).status, 401);
    await db.authSession.update({
      where: { tokenHash: digest(admin.split('=')[1]) },
      data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) },
    });
    assert.equal((await request('/auth/me', { cookies: admin })).status, 401);
  });

});
