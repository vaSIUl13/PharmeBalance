import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { SignedInFixture } from './fixture';
import { lockUser } from '../../src/modules/users/pharmacy-assignments';

type Inbox = { items: { id: number; readAt: string | null; recommendationId: number | null; title: string }[]; unread: number };

export async function testRolePermissions(t: TestContext, fixture: SignedInFixture, owner: string) {
  await t.test('a locked account still allows notification foreign-key checks', async () => {
    const { db, accounts } = fixture;
    await db.$transaction(async tx => {
      await lockUser(tx, accounts.head.userId);
      await db.$queryRaw`SELECT user_id FROM user_account WHERE user_id = ${accounts.head.userId} FOR KEY SHARE NOWAIT`;
    });
  });
  await t.test('only superadmin can change grants and role members receive one notification per change', async () => {
    const { db, accounts, request, admin, head } = fixture;
    const inboxPath = '/notifications/inbox';
    const path = '/roles/head/permissions/DATA_IMPORT';
    const set = (cookies: string | undefined, granted: boolean, csrf = true) =>
      request(path, { method: 'PUT', cookies, csrf, body: { granted } });
    assert.equal((await request('/roles/permissions', { cookies: admin })).status, 200);
    assert.equal((await request('/roles/permissions', { cookies: head })).status, 403);
    assert.equal((await set(admin, false)).status, 403);
    assert.equal((await set(owner, false, false)).status, 403);
    assert.equal((await request('/roles/head/permissions/NETWORK_VIEW', {
      method: 'PUT', cookies: owner, body: { granted: true },
    })).status, 403);
    assert.equal((await request('/roles/logist/permissions/DATA_IMPORT', {
      method: 'PUT', cookies: owner, body: { granted: true },
    })).status, 403);
    assert.equal((await request('/roles/superadmin/permissions/REGISTRATION_REVIEW', {
      method: 'PUT', cookies: owner, body: { granted: false },
    })).status, 403);
    assert.equal((await request(inboxPath)).status, 401);

    const roleId = accounts.head.roleId;
    const { permissionId } = await db.permission.findUniqueOrThrow({ where: { code: 'DATA_IMPORT' } });
    const pair = { roleId, permissionId };
    const other = await db.userAccount.create({ data: {
      roleId, login: 'other-head-' + fixture.run, email: 'other-head-' + fixture.run + '@example.invalid',
      firstName: 'Other', lastName: 'Head', passwordHash: accounts.head.passwordHash,
    } });
    accounts.otherHead = other;
    try {
      const responses = await Promise.all([set(owner, false), set(owner, false)]);
      assert.deepEqual(responses.map(response => response.status), [200, 200]);
      const changes = await Promise.all(responses.map(response => response.json() as Promise<{ changed: boolean }>));
      assert.equal(changes.filter(result => result.changed).length, 1);
      const principal = await (await request('/auth/me', { cookies: head })).json();
      assert(!principal.permissions.includes('DATA_IMPORT'));
      const page: Inbox = await (await request(inboxPath, { cookies: head })).json();
      assert.equal(page.unread, 1);
      assert.equal(page.items[0].title, 'Змінено дозволи ролі');
      assert.equal(await db.systemNotification.count({ where: {
        userId: { in: [accounts.admin.userId, accounts.superadmin.userId] }, title: 'Змінено дозволи ролі',
      } }), 2);
      assert.equal(await db.systemNotification.count({ where: { userId: other.userId } }), 1);
      assert.equal(await db.auditLog.count({ where: { userId: accounts.superadmin.userId, eventType: 'ROLE_PERMISSION_CHANGED' } }), 1);
      const id = page.items[0].id;
      const read = (cookies: string | undefined, csrf = true) =>
        request(inboxPath + '/' + id + '/read', { method: 'POST', cookies, csrf });
      assert.equal((await read(admin)).status, 404);
      assert.equal((await read(head, false)).status, 403);
      assert.equal((await read(head)).status, 204);
      assert.equal((await read(head)).status, 204);
      const after: Inbox = await (await request(inboxPath, { cookies: head })).json();
      assert.equal(after.unread, 0);
      assert(after.items[0].readAt);

      assert.equal((await set(owner, true)).status, 200);
      const updated: Inbox = await (await request(inboxPath, { cookies: head })).json();
      assert.equal(updated.unread, 1);
      assert.equal((await request(inboxPath + '/read-through/' + updated.items[0].id, {
        method: 'POST', cookies: head,
      })).status, 204);
      const readAll: Inbox = await (await request(inboxPath, { cookies: head })).json();
      assert.equal(readAll.unread, 0);
    } finally {
      await db.rolePermission.createMany({ data: [pair], skipDuplicates: true });
    }
  });
}
