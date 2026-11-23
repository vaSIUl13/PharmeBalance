import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { SignedInFixture } from './fixture';
import { verifyPassword } from '../../src/modules/auth/auth-security';

export async function testRegistration(t: TestContext, fixture: SignedInFixture) {
  await t.test('registration requires reviewer approval and applies existing role and pharmacy rules', async test => {
    const { db, request, run, admin, head, accounts, managedIds } = fixture;
    const previousReviewer = process.env.REGISTRATION_REVIEWER_EMAIL;
    process.env.REGISTRATION_REVIEWER_EMAIL = accounts.admin.email;
    const email = 'applicant.' + run + '@example.invalid';
    const rejectedEmail = 'reject.' + run + '@example.invalid';
    test.after(async () => {
      if (previousReviewer === undefined) delete process.env.REGISTRATION_REVIEWER_EMAIL;
      else process.env.REGISTRATION_REVIEWER_EMAIL = previousReviewer;
      await db.registrationRequest.deleteMany({ where: { email: { in: [email, rejectedEmail] } } });
    });

    const path = '/registration-requests';
    const body = { email, password: 'test1234', login: 'applicant.' + run,
      firstName: 'Test', lastName: 'Applicant', role: 'head', consent: true };
    const submit = (input: object, csrf = true) => request(path, { method: 'POST', body: input, csrf });
    assert.equal((await submit(body, false)).status, 403);
    assert.equal((await submit({ ...body, role: 'owner' })).status, 400);
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
    const visible = await request(path + '/' + id, { cookies: admin });
    assert.equal(visible.status, 200);
    assert(!('passwordHash' in await visible.json()));

    const approve = (pharmacyId?: number) => request(path + '/' + id + '/approve', {
      method: 'POST', body: { pharmacyId }, cookies: admin,
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
    assert.equal((await request(path + '/' + denied.id + '/reject', { method: 'POST', cookies: admin })).status, 204);
    assert.equal((await request(path + '/' + denied.id + '/approve', { method: 'POST', cookies: admin })).status, 409);
    assert.equal(await db.userAccount.count({ where: { email: rejectedEmail } }), 0);
    assert.equal((await db.registrationRequest.findUniqueOrThrow({ where: { id: denied.id } })).passwordHash, null);
  });
}
