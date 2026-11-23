import type { TestContext } from 'node:test';
import type { Fixture } from './fixture';
import assert = require('node:assert/strict');
import { randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import { digest, encryptMfa } from '../../src/modules/auth/auth-security';

export async function testSignIn(t: TestContext, context: Fixture) {
  const { db, password, request, cookie, login, accounts } = context;
  let admin: string | undefined;
  let head: string | undefined;
  await t.test('CSRF, legacy hash upgrade, secure cookies and parallel requests', async () => {
    assert.equal((await login('head', password, false)).status, 403);
    assert.equal((await login('head', 'wrong-password')).status, 401);
    const response = await login('head');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie') ?? '', /HttpOnly.*Secure.*SameSite=Lax/i);
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
    const finish = (cookies: string | undefined) => request('/auth/mfa/verify', { method: 'POST', body: { code }, cookies });
    const verified = await finish(pending);
    assert.equal(verified.status, 204);
    admin = cookie(verified);
    assert.equal((await finish(pending)).status, 401);
    const second = await login('admin');
    assert.equal((await finish(cookie(second, '__Host-pharme-mfa='))).status, 401);
    const third = await login('admin');
    const thirdPending = cookie(third, '__Host-pharme-mfa=');
    const recovery = (cookies: string | undefined) => request('/auth/mfa/verify', {
      method: 'POST', body: { code: backup }, cookies,
    });
    assert.equal((await recovery(thirdPending)).status, 204);
    const fourth = await login('admin');
    assert.equal((await recovery(cookie(fourth, '__Host-pharme-mfa='))).status, 401);
  });
  assert(head && admin);
  return { head, admin };
}
