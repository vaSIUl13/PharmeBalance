import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { pharmacyScope, transferScope } from '../../src/modules/auth/auth-scope';
import {
  challengeCookie, cookieValue, currentHashPrefix, decryptMfa, encryptMfa,
  hashPassword, sessionCookie, token, verifyPassword,
} from '../../src/modules/auth/auth-security';
import { parseAccess, parseCreate } from '../../src/modules/users/dto/user-input';

test('user creation normalizes identity fields and preserves the password verbatim', () => {
  const user = {
    login: '  head  ', firstName: '  Олена ', lastName: ' Петренко',
    email: ' HEAD@example.org ', role: 'head', pharmacyId: 1, password: ' test phrase',
  };
  assert.deepEqual(parseCreate(user), {
    ...user, login: 'head', firstName: 'Олена', lastName: 'Петренко', email: 'head@example.org',
  });
  assert.equal(parseCreate({ ...user, password: 'x'.repeat(256) }).password.length, 256);
  for (const fields of [
    { password: 'x'.repeat(11) }, { password: 'x'.repeat(257) }, { email: 'bad@address' },
    { role: undefined }, { login: 'x'.repeat(51) }, { firstName: ' ' }, { lastName: 'x'.repeat(61) },
  ]) {
    assert.throws(() => parseCreate({ ...user, ...fields }), BadRequestException);
  }
});

test('access changes accept supported roles and positive 32-bit pharmacy IDs', () => {
  for (const role of ['admin', 'manager', 'head', 'logist']) {
    assert.deepEqual(parseAccess({ role }), { role, pharmacyId: undefined });
  }
  for (const pharmacyId of [1, 2147483647]) {
    assert.deepEqual(parseAccess({ pharmacyId }), { role: undefined, pharmacyId });
  }
  for (const input of [null, [], {}, { role: 'unknown' }, ...[0, 2147483648, 1.5, '1'].map(pharmacyId => ({ pharmacyId }))]) {
    assert.throws(() => parseAccess(input), BadRequestException);
  }
});

test('pharmacy visibility requires a network grant or a current personal assignment', () => {
  const principal = { role: 'manager', userId: 17 };
  assert.deepEqual(pharmacyScope({ ...principal, permissions: ['NETWORK_VIEW'] }), {});
  assert.deepEqual(pharmacyScope({ ...principal, permissions: ['PHARMACY_VIEW'] }), {
    userPharmacyRows: { some: { userId: 17, unassignedAt: null } },
  });
  assert.deepEqual(pharmacyScope({ ...principal, permissions: [] }), { pharmacyId: { in: [] } });
});

test('transfer visibility depends on role, grant, direction and assignment', () => {
  const assigned = { userPharmacyRows: { some: { userId: 17, unassignedAt: null } } };
  assert.deepEqual(transferScope({ role: 'manager', userId: 17, permissions: ['NETWORK_VIEW'] }), {});
  assert.deepEqual(transferScope({ role: 'logist', userId: 17, permissions: ['TRANSFER_VIEW', 'PHARMACY_VIEW'] }), {
    status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] }, donorStock: { pharmacy: assigned },
  });
  assert.deepEqual(transferScope({ role: 'head', userId: 17, permissions: ['RECEIPT_CONFIRM', 'PHARMACY_VIEW'] }), {
    status: { in: ['IN_PROGRESS', 'COMPLETED'] }, recipientStock: { pharmacy: assigned },
  });
  for (const [role, grant] of [['logist', 'RECEIPT_CONFIRM'], ['head', 'TRANSFER_VIEW'], ['manager', 'TRANSFER_VIEW']]) {
    assert.deepEqual(transferScope({ role, userId: 17, permissions: ['PHARMACY_VIEW', grant] }), {
      recommendationId: { in: [] },
    });
  }
  assert.deepEqual(transferScope({ role: 'head', userId: 17, permissions: ['RECEIPT_CONFIRM'] }).recipientStock, {
    pharmacy: { pharmacyId: { in: [] } },
  });
});

test('session and MFA cookies accept exactly one well-formed token of the requested name', () => {
  const session = token();
  const challenge = token();
  const header = sessionCookie + '=' + session + '; ' + challengeCookie + '=' + challenge;
  assert.equal(cookieValue(header, sessionCookie), session);
  assert.equal(cookieValue(header, challengeCookie), challenge);
  assert.equal(cookieValue(undefined, sessionCookie), undefined);
  assert.equal(cookieValue(challengeCookie + '=' + challenge, sessionCookie), undefined);
  for (const value of ['', session.slice(1), session + 'A', session.slice(1) + '=']) {
    assert.equal(cookieValue(sessionCookie + '=' + value, sessionCookie), undefined);
  }
  assert.equal(cookieValue(header + '; ' + sessionCookie + '=' + session, sessionCookie), undefined);
});

test('Argon2id hashes verify the original password and reject wrong passwords and malformed hashes', async () => {
  const password = 'test-only passphrase';
  const hash = await hashPassword(password);
  assert.ok(hash.startsWith(currentHashPrefix));
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('different passphrase', hash), false);
  assert.equal(await verifyPassword(password, 'invalid-hash'), false);
});

test('MFA ciphertext is bound to its account and authenticated against modification', (t) => {
  const previousKey = process.env.AUTH_MFA_KEY;
  t.after(() => {
    if (previousKey === undefined) delete process.env.AUTH_MFA_KEY;
    else process.env.AUTH_MFA_KEY = previousKey;
  });
  process.env.AUTH_MFA_KEY = randomBytes(32).toString('base64');
  const secret = 'test fixture';
  const encrypted = encryptMfa(secret, 17);
  assert.equal(decryptMfa(encrypted, 17), secret);
  assert.throws(() => decryptMfa(encrypted, 18));
  const modified = Buffer.from(encrypted, 'base64');
  modified[modified.length - 1] ^= 1;
  assert.throws(() => decryptMfa(modified.toString('base64'), 17));
});
