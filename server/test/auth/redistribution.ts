import type { TestContext } from 'node:test';
import type { TransferFixture } from './fixture';
import assert = require('node:assert/strict');
import { testReports } from './reports';
import { testOutbox } from './outbox';

interface TransferScenario {
  id: number;
  stale: { recommendationId: number };
  sku: string;
  donorId: number;
  recipientId: number;
  donorPharmacy: number;
  recipientPharmacy: number;
  other: { stockId: number };
  logist: string | undefined;
  post(path: string, cookies?: string, body?: unknown): Promise<Response>;
  act(command: string, cookies?: string, body?: unknown, recommendationId?: number): Promise<Response>;
}

export type ReportScenario = Pick<TransferScenario, 'id' | 'recipientPharmacy' | 'recipientId' | 'donorId' | 'logist'>;
export type OutboxScenario = Omit<TransferScenario, 'recipientPharmacy' | 'logist'>;

export async function testRedistribution(t: TestContext, context: TransferFixture) {
  const { origin, db, root, run, accounts, pharmacyIds, managedIds, stockIds, forecastRunIds, request, cookie, login, manager, head } = context;
  await t.test('redistribution reserves at confirmation and moves physical stock at receipt', async transferTest => {
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
    const post = (path: string, cookies = manager, body: unknown = {}) => request(path, { method: 'POST', cookies, body });
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
    const act = (code: string, cookies?: string, body?: unknown, id = rec.recommendationId) => post('/recommendations/' + id + '/actions/' + code, cookies, body);
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
    assert(donorSession);
    const importStock = async () => {
      const form = new FormData();
      form.set('pharmacyId', String(donorPharmacy));
      form.set('snapshotAt', snapshotAt);
      form.set('file', new Blob(['sku,quantity\n' + sku + ',99']), 'older.csv');
      return fetch(root + '/imports/stocks', { method: 'POST', body: form, headers: {
        Cookie: donorSession, Origin: origin, 'X-Pharme-CSRF': '1',
      } });
    };
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual((await Promise.all([act('RECEIVE', head, { quantity: 100 }, id),
      act('RECEIVE', head, { quantity: 100 }, id), importStock()])).map(r => r.status), [200, 200, 422]);
    assert.deepEqual((await current()).slice(0, 2).map(s => [s.quantity, s.reservedQuantity]),
      [[recipient.quantity + 100, 0], [donor.quantity - 100, 0]]);
    const history = await request('/recommendations/' + id + '/history', { cookies: manager });
    assert.deepEqual((await history.json()).map((a: { actionType: { code: string }; quantity: number; userId: number }) => [a.actionType.code, a.quantity, a.userId]),
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
      Cookie: head, Origin: origin, 'X-Pharme-CSRF': '1',
    } })).status, 200);
    assert.equal((await act('CONFIRM', manager, {}, stale.recommendationId)).status, 409);
    assert.equal((await db.recommendation.findUniqueOrThrow({ where: { recommendationId: stale.recommendationId } })).status, 'STALE');
    await testReports(transferTest, context, { id, recipientPharmacy, recipientId, donorId, logist });
    await testOutbox(transferTest, context, { id, stale, sku, donorId, recipientId, donorPharmacy, other, post, act });
    await db.recommendationAction.deleteMany({ where: { recommendationId: id } });
    await db.userPharmacy.update({ where: { userId_pharmacyId: { userId: accounts.head.userId, pharmacyId: recipientPharmacy } },
      data: { unassignedAt: new Date() } });
  });
}
