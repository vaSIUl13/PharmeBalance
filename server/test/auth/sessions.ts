import type { TestContext } from 'node:test';
import type { TransferFixture } from './fixture';
import assert = require('node:assert/strict');
import { digest } from '../../src/modules/auth/auth-security';
import { captureResetMail } from './reset-mail';

export async function testSessions(t: TestContext, context: TransferFixture) {
  const { db, redis, accounts, request, login, cookie, head, admin, password, nextPassword } = context;
  let { manager } = context;
  await t.test('selected session revocation, ownership checks, and logout all', async () => {
    const second = cookie(await login('head'));
    const sessions: { id: string; current: boolean; device: string; lastSeenAt: string; tokenHash?: string }[] = await (await request('/auth/sessions', { cookies: head })).json();
    assert.equal(sessions.length, 2);
    assert.equal(sessions.filter((entry) => entry.current).length, 1);
    assert(sessions.every((entry) => entry.device === 'Integration Test' && entry.lastSeenAt && !entry.tokenHash));
    const other = sessions.find((entry) => !entry.current);
    assert(other);
    assert.equal((await request('/auth/sessions/' + other.id, { method: 'DELETE', cookies: manager })).status, 204);
    assert.equal((await request('/auth/me', { cookies: second })).status, 200);
    assert.equal((await request('/auth/sessions/' + other.id, { method: 'DELETE', cookies: head })).status, 204);
    assert.equal((await request('/auth/me', { cookies: second })).status, 401);
    assert.equal((await request('/auth/logout-all', { method: 'POST', cookies: head })).status, 204);
    assert.equal((await request('/auth/me', { cookies: head })).status, 401);
  });

  await t.test('password reset is single-use and revokes existing sessions', async resetTest => {
    const email = await captureResetMail(resetTest, async () => {
      const response = await request('/auth/password/reset-request', {
        method: 'POST', body: { email: accounts.manager.email },
      });
      assert.equal(response.status, 204);
    });
    const resetToken = email.match(/#token=([A-Za-z0-9_-]{43})/)?.[1];
    assert(resetToken);
    const stored = await db.authChallenge.findUniqueOrThrow({ where: { tokenHash: digest(resetToken) } });
    assert.equal(stored.userId, accounts.manager.userId);
    const reset = () => request('/auth/password/reset', { method: 'POST', body: { token: resetToken, newPassword: nextPassword } });
    const results = await Promise.all([reset(), reset()]);
    assert.deepEqual(results.map((res) => res.status).sort(), [204, 401]);
    assert.equal((await request('/auth/me', { cookies: manager })).status, 401);
    assert.equal((await login('manager', password)).status, 401);
    const renewed = cookie(await login('manager', nextPassword));
    assert(renewed);
    manager = renewed;
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
}
