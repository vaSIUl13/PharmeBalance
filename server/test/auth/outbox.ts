import type { OutboxScenario } from './redistribution';
import type { TestContext } from 'node:test';
import type { TransferFixture } from './fixture';
import assert = require('node:assert/strict');
import { EmailService } from '../../src/modules/notifications/email.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';

export async function testOutbox(t: TestContext, context: TransferFixture, transfer: OutboxScenario) {
  const { db, run, accounts, transferIds, manager, admin } = context;
  const { id, stale, sku, donorId, recipientId, donorPharmacy, other, post, act } = transfer;
  await t.test('transfer outbox rolls back, retries and delivers once per eligible recipient', async emailTest => {
    const events = await db.emailEvent.findMany({ where: { action: { recommendationId: id } },
      include: { action: { include: { actionType: true } } }, orderBy: { actionId: 'asc' } });
    assert.deepEqual(events.map(e => e.action.actionType.code), ['CONFIRM', 'DISPATCH', 'RECEIVE']);
    assert.equal(await db.emailEvent.count({ where: { action: { recommendationId: stale.recommendationId } } }), 0);
    const rejectedDraft = await db.recommendation.create({ data: { donorStockId: donorId, recipientStockId: recipientId,
      quantity: 1, priority: 3 } });
    transferIds.push(rejectedDraft.recommendationId);
    const rejectedType = await db.actionType.findUniqueOrThrow({ where: { code: 'REJECT' } });
    await assert.rejects(db.$transaction(async tx => {
      await tx.recommendationAction.create({ data: { actionTypeId: rejectedType.actionTypeId, userId: accounts.manager.userId,
        recommendationId: rejectedDraft.recommendationId, emailEvent: { create: { donor: 'D', recipient: 'R', sku, drugName: 'Test' } } } });
      throw Error('rollback outbox');
    }), /rollback outbox/);
    assert.equal(await db.emailEvent.count({ where: { action: { recommendationId: rejectedDraft.recommendationId } } }), 0);
    assert.equal((await act('REJECT', manager, {}, rejectedDraft.recommendationId)).status, 200);
    if (process.env.AUTH_TEST_MAILPIT !== '1') return emailTest.diagnostic('SMTP integration is opt-in with AUTH_TEST_MAILPIT=1');
    accounts.sameMailbox = await db.userAccount.create({ data: { login: 'alias-' + run,
      email: accounts.logist.email.toUpperCase(), firstName: 'Alias', lastName: 'Test',
      roleId: accounts.logist.roleId, passwordHash: 'disabled-test' } });
    await db.userPharmacy.create({ data: { userId: accounts.sameMailbox.userId, pharmacyId: donorPharmacy } });
    const unassignedTransfer = await db.recommendation.create({ data: { donorStockId: donorId,
      recipientStockId: other.stockId, quantity: 1, priority: 4 } });
    transferIds.push(unassignedTransfer.recommendationId);
    const dispatch = await db.actionType.findUniqueOrThrow({ where: { code: 'DISPATCH' } });
    const missing = await db.recommendationAction.create({ data: { actionTypeId: dispatch.actionTypeId,
      userId: accounts.logist.userId, recommendationId: unassignedTransfer.recommendationId,
      emailEvent: { create: { donor: 'D', recipient: 'R', sku, drugName: 'Test' } } } });
    const conf = { EMAIL_ENABLED: 'true', EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1',
      SMTP_SECURE: 'false', EMAIL_FROM: 'PharmaBalance <notifications@pharmabalance.test>', SMTP_USER: '', SMTP_PASSWORD: '' };
    const previous = Object.fromEntries(Object.keys(conf).map(key => [key, process.env[key]]));
    Object.assign(process.env, conf);
    const failedTransport = new EmailService();
    try {
      const unavailable = new NotificationsService(db, failedTransport);
      await unavailable.processOne();
      const prior = await db.emailDelivery.findFirstOrThrow({ where: { attempts: 1, acceptedAt: null } });
      assert(prior.nextAttemptAt > new Date() && prior.lastError);
      await db.emailDelivery.update({ where: { id: prior.id }, data: { nextAttemptAt: new Date(), attempts: 4 } });
      await unavailable.processOne();
      const failed = await db.emailDelivery.findUniqueOrThrow({ where: { id: prior.id } });
      assert(failed.failedAt);
      const retryUrl = '/notifications/failed/' + prior.id + '/retry';
      assert.equal((await post(retryUrl)).status, 403);
      assert.equal((await post(retryUrl, admin)).status, 204);
      assert.equal((await post(retryUrl, admin)).status, 404);
      process.env.SMTP_PORT = '1025';
      const smtp = new EmailService();
      try {
        const first = new NotificationsService(db, smtp);
        const restarted = new NotificationsService(db, smtp);
        for (let i = 0; i < 20; i++) {
          if (!(await Promise.all([first.processOne(), restarted.processOne()])).some(Boolean)) break;
        }
        const sent = await db.emailDelivery.findMany({ where: { actionId: { in: events.map(e => e.actionId) } } });
        assert.equal(sent.length, 5);
        assert(sent.every(delivery => delivery.acceptedAt));
        const noRecipient = await db.emailEvent.findUniqueOrThrow({ where: { actionId: missing.actionId } });
        assert.deepEqual(noRecipient.missingRoles, ['manager']);
        assert.equal(noRecipient.recipientCount, 1);
        assert.deepEqual(sent.map(delivery => delivery.userId).sort(),
          [accounts.logist.userId, accounts.head.userId, accounts.donorHead.userId,
            accounts.manager.userId, accounts.manager.userId].sort());
        assert.equal((await db.emailDelivery.findUniqueOrThrow({ where: { id: prior.id } })).attempts, 1);
        const inbox = await (await fetch('http://127.0.0.1:8025/api/v1/messages?limit=50')).json();
        const transferMessages = inbox.messages.filter((message: { Subject: string; ID: string }) => message.Subject.includes('#' + id + ' ·'));
        assert.equal(transferMessages.length, 5);
        const letter = await (await fetch('http://127.0.0.1:8025/api/v1/message/' + transferMessages[0].ID)).json();
        assert.match(letter.HTML, /<table/);
        assert.match(letter.Text, new RegExp(sku));
      } finally { smtp.onModuleDestroy(); }
    } finally {
      failedTransport.onModuleDestroy();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
}
