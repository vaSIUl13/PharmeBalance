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
  t.after(async () => {
    const ids = Object.values(accounts).map((user) => user.userId);
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
