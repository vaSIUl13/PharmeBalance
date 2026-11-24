import type { TestContext } from 'node:test';
import type { SignedInFixture } from './fixture';
import assert = require('node:assert/strict');

export async function testAdministration(t: TestContext, context: SignedInFixture) {
  const { db, run, accounts, managedIds, request, cookie, login, admin, head, password } = context;
  await t.test('admin creates an account with eight characters and notifies the recipient once', async test => {
    const email = context.email;
    const send = test.mock.method(email, 'sendAccountNotice', async (to: string, message: { text: string; html: string }) => {
      assert.equal(to, run + '.notice@example.test');
      assert(!message.text.includes('Temp1234') && !message.html.includes('Temp1234'));
      assert.equal(await db.userAccount.count({ where: { email: to } }), 1);
    });
    Object.defineProperty(email, 'enabled', { value: true });
    test.after(() => { Object.defineProperty(email, 'enabled', { value: false }); });
    const body = { email: run + '.notice@example.test', login: 'notice-' + run,
      firstName: 'Test', lastName: 'Notice', role: 'manager', password: 'Temp1234' };
    const create = (password: string) => request('/users', { method: 'POST', cookies: admin, body: { ...body, password } });
    assert.equal((await create('Temp123')).status, 400);
    const created = await create(body.password);
    assert.equal(created.status, 201);
    accounts.notice = await created.json();
    assert.equal((await create(body.password)).status, 409);
    assert.equal(send.mock.callCount(), 1);
    await send.mock.calls[0].result;
  });
  await t.test('managed resource routes reject IDs outside the database range', async () => {
    for (const id of ['0', '-1', '2147483648', '99999999999999999']) {
      assert.equal((await request('/pharmacies/' + id, { cookies: admin })).status, 400);
      assert.equal((await request('/users/' + id, { cookies: admin, method: 'PATCH', body: { role: 'manager' } })).status, 400);
      assert.equal((await request('/users/' + id + '/block', { cookies: admin, method: 'POST' })).status, 400);
    }
  });
  await t.test('administrators link a catalog pharmacy, assign exactly one head, activate and audit it', async test => {
    const external = await db.externalPharmacy.create({ data: {
      source: 'OSM', externalId: 'admin-' + run, name: 'Catalog ' + run, city: 'Test', address: 'Test',
      latitude: 49, longitude: 24,
    } });
    test.after(async () => { await db.externalPharmacy.delete({ where: { id: external.id } }); });
    assert.equal((await request('/pharmacies/external?q=' + run, { cookies: head })).status, 403);
    const catalog = await request('/pharmacies/external?complete=true&q=' + run, { cookies: admin });
    assert.equal(catalog.status, 200);
    assert.deepEqual((await catalog.json()).items.map((row: { id: number }) => row.id), [external.id]);
    const created = await request('/pharmacies', { method: 'POST', cookies: admin, body: {
      name: 'Managed', city: 'Test', address: 'Test', latitude: 49, longitude: 24,
      externalRecordIds: [external.id],
    } });
    assert.equal(created.status, 201);
    const { pharmacyId, isActive, code } = await created.json();
    assert.equal(code, 'EXT-' + external.id);
    managedIds.push(pharmacyId);
    assert.equal(isActive, false);
    assert.equal((await db.externalPharmacy.findUniqueOrThrow({ where: { id: external.id } })).pharmacyId, pharmacyId);
    assert.equal((await request('/pharmacies', { method: 'POST', cookies: admin, body: {
      code: 'X' + run, name: 'Duplicate link', city: 'Test', address: 'Test', latitude: 49, longitude: 24,
      externalRecordIds: [external.id],
    } })).status, 409);
    assert.equal(await db.pharmacy.count({ where: { code: 'X' + run } }), 0);
    const manual = await request('/pharmacies', { method: 'POST', cookies: admin, body: {
      code: 'Y' + run, name: 'Manual pharmacy', city: 'Test', address: 'Test', latitude: 49.841353, longitude: 24.031773,
    } });
    assert.equal(manual.status, 201);
    const manualPharmacy = await manual.json();
    managedIds.push(manualPharmacy.pharmacyId);
    assert.equal(Number(manualPharmacy.latitude), 49.841353);
    assert.equal(Number(manualPharmacy.longitude), 24.031773);
    const body = { login: 'new-' + run, email: run + '@example.invalid', firstName: 'New',
      lastName: 'Head', password, role: 'manager' };
    const create = (cookies: string | undefined, data: unknown) => request('/users', { method: 'POST', cookies, body: data });
    assert.equal((await create(head, body)).status, 403);
    assert.equal((await create(admin, { ...body, role: 'head' })).status, 400);
    const user = await create(admin, body);
    assert.equal(user.status, 201);
    accounts.newHead = await user.json();
    assert.equal(accounts.newHead.passwordHash, undefined);
    assert.equal((await create(admin, body)).status, 409);
    const session = cookie(await login('newHead'));
    const assign = (id: number) => request('/users/' + id, { method: 'PATCH', cookies: admin, body: { role: 'head', pharmacyId } });
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
    assert.deepEqual((await roles.json()).map((role: { code: string }) => role.code), ['admin', 'head', 'logist', 'manager']);
    for (const route of ['/roles', '/users', '/audit']) {
      assert.equal((await request(route, { cookies: session })).status, 403);
    }
    for (const route of ['/users?after=-1', '/audit?before=oops']) {
      assert.equal((await request(route, { cookies: admin })).status, 400);
    }
    const visible = await (await request('/pharmacies', { cookies: session })).json();
    assert.deepEqual(visible.items.map((p: { pharmacyId: number; isActive: boolean }) => [p.pharmacyId, p.isActive]), [[pharmacyId, true]]);
    assert.equal((await request('/pharmacies/' + pharmacyId, { cookies: session })).status, 200);
    assert.equal((await request('/pharmacies/' + pharmacyId, { cookies: head })).status, 404);
    const activationNotices = await db.systemNotification.findMany({ where: {
      title: 'Аптеку активовано', message: { contains: '(' + code + ')' },
      userId: { in: [accounts.admin.userId, accounts.superadmin.userId, accounts.manager.userId, accounts.head.userId, accounts.newHead.userId] },
    }, select: { userId: true } });
    assert.equal(activationNotices.length, 4);
    assert.deepEqual(new Set(activationNotices.map(row => row.userId)),
      new Set([accounts.admin.userId, accounts.superadmin.userId, accounts.manager.userId, accounts.newHead.userId]));
    const events = await db.auditLog.findMany({ where: { targetUserId: accounts.newHead.userId }, orderBy: { logId: 'asc' } });
    assert.deepEqual(events.map(e => e.eventType), ['ACCOUNT_CREATED', 'ROLE_CHANGED', 'PHARMACY_ASSIGNED', 'REFERENCE_EDITED']);
    assert.equal((await request('/users/' + accounts.newHead.userId + '/block', { method: 'POST', cookies: admin })).status, 204);
    const history = await request('/audit?targetUserId=' + accounts.newHead.userId, { cookies: admin });
    assert.equal(history.status, 200);
    const log: { eventType: string; userId: number; targetUserId: number }[] = (await history.json()).items;
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
}
