import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { SignedInFixture } from './fixture';
import { authenticator } from 'otplib';
import { encryptMfa, verifyPassword } from '../../src/modules/auth/auth-security';
import { testRolePermissions } from './system-notifications';

export async function testRegistration(t: TestContext, fixture: SignedInFixture) {
  await t.test('registration requires reviewer approval and applies existing role and pharmacy rules', async test => {
    const { db, request, run, admin, head, accounts, managedIds, login, cookie } = fixture;
    const previousReviewer = process.env.REGISTRATION_REVIEWER_EMAIL;
    process.env.REGISTRATION_REVIEWER_EMAIL = accounts.superadmin.email;
    const email = 'applicant.' + run + '@example.invalid';
    const rejectedEmail = 'reject.' + run + '@example.invalid';
    test.after(async () => {
      if (previousReviewer === undefined) delete process.env.REGISTRATION_REVIEWER_EMAIL;
      else process.env.REGISTRATION_REVIEWER_EMAIL = previousReviewer;
      await db.registrationRequest.deleteMany({ where: { email: { in: [email, rejectedEmail] } } });
    });

    const secret = authenticator.generateSecret();
    assert.equal((await login('superadmin')).status, 403);
    await db.authMfa.create({ data: {
      userId: accounts.superadmin.userId, encryptedSecret: encryptMfa(secret, accounts.superadmin.userId),
    } });
    const challenge = await login('superadmin');
    assert.equal((await challenge.json()).mfaRequired, true);
    const verified = await request('/auth/mfa/verify', {
      method: 'POST', body: { code: authenticator.generate(secret) }, cookies: cookie(challenge, '__Host-pharme-mfa='),
    });
    assert.equal(verified.status, 204);
    const owner = cookie(verified);
    assert(owner);
    await testRolePermissions(test, fixture, owner);
    assert.equal((await request('/users', { cookies: owner })).status, 200);
    assert.equal((await request('/users/' + accounts.superadmin.userId + '/block', { method: 'POST', cookies: admin })).status, 403);
    assert.equal((await request('/users/' + accounts.superadmin.userId, {
      method: 'PATCH', body: { role: 'admin' }, cookies: admin,
    })).status, 403);

    const path = '/registration-requests';
    const body = { email, password: 'test1234', login: 'applicant.' + run,
      firstName: 'Test', lastName: 'Applicant', role: 'head', consent: true };
    const submit = (input: object, csrf = true) => request(path, { method: 'POST', body: input, csrf });
    assert.equal((await submit(body, false)).status, 403);
    assert.equal((await submit({ ...body, role: 'superadmin' })).status, 400);
    assert.equal((await submit({ ...body, consent: false })).status, 400);

    assert.equal((await submit({ ...body, password: 'test123' })).status, 400);

    const submitted = await Promise.all([submit(body), submit(body)]);
    assert.deepEqual(submitted.map(response => response.status), [202, 202]);
    assert.equal(await db.userAccount.count({ where: { email } }), 0);
    const pending = await db.registrationRequest.findMany({ where: { email } });
    assert.equal(pending.length, 1);
    const { id, passwordHash } = pending[0];
    assert(passwordHash && passwordHash !== body.password);
    assert(await verifyPassword(body.password, passwordHash));
    assert.equal((await request(path + '/' + id)).status, 401);
    assert.equal((await request(path + '/' + id, { cookies: head })).status, 403);
    assert.equal((await request(path + '/' + id, { cookies: admin })).status, 403);
    assert.equal((await request(path + '/' + id + '/approve', { method: 'POST', cookies: admin })).status, 403);
    const visible = await request(path + '/' + id, { cookies: owner });
    assert.equal(visible.status, 200);
    assert(!('passwordHash' in await visible.json()));

    const approve = (pharmacyId?: number) => request(path + '/' + id + '/approve', {
      method: 'POST', body: { pharmacyId }, cookies: owner,
    });
    assert.equal((await approve()).status, 400);
    const pharmacy = await db.pharmacy.create({ data: {
      code: 'AR-' + run, name: 'Registration fixture', address: 'Test', city: 'Test', latitude: 49, longitude: 24,
      isActive: false,
    } });
    managedIds.push(pharmacy.pharmacyId);
    assert.deepEqual((await Promise.all([approve(pharmacy.pharmacyId), approve(pharmacy.pharmacyId)])).map(r => r.status), [204, 204]);
    const user = await db.userAccount.findUniqueOrThrow({ where: { email }, include: { role: true, userPharmacyRows: true } });
    accounts.registration = user;
    assert.equal(user.role.code, 'head');
    assert.equal(user.userPharmacyRows[0].pharmacyId, pharmacy.pharmacyId);
    assert.equal((await db.registrationRequest.findUniqueOrThrow({ where: { id } })).passwordHash, null);

    assert.equal((await submit({ ...body, email: rejectedEmail, login: 'reject.' + run, role: 'admin' })).status, 202);
    const denied = await db.registrationRequest.findFirstOrThrow({ where: { email: rejectedEmail } });
    assert.equal((await request(path + '/' + denied.id + '/reject', { method: 'POST', cookies: owner })).status, 204);
    assert.equal((await request(path + '/' + denied.id + '/approve', { method: 'POST', cookies: owner })).status, 409);
    assert.equal(await db.userAccount.count({ where: { email: rejectedEmail } }), 0);
    assert.equal((await db.registrationRequest.findUniqueOrThrow({ where: { id: denied.id } })).passwordHash, null);
  });
}
