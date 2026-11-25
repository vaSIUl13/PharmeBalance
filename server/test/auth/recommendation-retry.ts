import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { generateRecommendations } from '../../src/modules/recommendations/generate';
import type { TransferFixture } from './fixture';

export async function testRecommendationRetry(t: TestContext, context: TransferFixture) {
  await t.test('the same forecast retries an uncovered risk and notifies managers only once', async () => {
    const { accounts, db, drugIds, forecastRunIds, manager, pharmacyIds, request, run, stockIds } = context;
    const drug = await db.drug.create({ data: { sku: 'RETRY-' + run, name: 'Retry fixture', dosageForm: 'tablet', unit: 'pack' } });
    drugIds.push(drug.drugId);
    const [recipient, donor] = await Promise.all(pharmacyIds.slice(0, 2).map((pharmacyId, index) => db.stockItem.create({
      data: { pharmacyId, drugId: drug.drugId, quantity: 0, msl: index ? 0 : 5, maxLevel: 10 },
    })));
    stockIds.push(recipient.stockId, donor.stockId);
    const snapshot = await db.forecastRun.create({ data: {
      asOf: new Date('2098-01-01'), synthetic: false, version: 'retry-' + run, policy: {},
    } });
    forecastRunIds.push(snapshot.id);
    const forecast = await db.forecast.create({ data: {
      stockId: recipient.stockId, runId: snapshot.id, modelVersion: run, quantity: 0, msl: 5, shortage: 5,
    } });
    const generate = () => db.$transaction(tx => generateRecommendations(tx, snapshot.id, false));
    assert.equal((await generate()).created, 0);
    assert.equal((await db.forecast.findUniqueOrThrow({ where: { forecastId: forecast.forecastId } })).redistributionReason,
      'NO_DONOR_WITH_ENOUGH_SURPLUS');
    assert.equal((await generate()).created, 0);
    await db.stockItem.update({ where: { stockId: donor.stockId }, data: { quantity: 20 } });
    const retries = await Promise.all([generate(), generate()]);
    assert.deepEqual(retries.map(result => result.created).sort(), [0, 1]);
    const recommendation = await db.recommendation.findUniqueOrThrow({ where: { forecastId: forecast.forecastId } });
    assert.equal((await db.forecast.findUniqueOrThrow({ where: { forecastId: forecast.forecastId } })).redistributionReason, null);
    assert.equal((await db.stockItem.findUniqueOrThrow({ where: { stockId: donor.stockId } })).reservedQuantity, 0);
    const notices = await db.systemNotification.findMany({ where: { userId: accounts.manager.userId,
      title: 'Готові рекомендації перерозподілу', message: { startsWith: `Прогноз №${snapshot.id} ·` } } });
    assert.equal(notices.length, 1);
    assert.deepEqual(notices[0].recommendationIds, [recommendation.recommendationId]);
    const batch = await request('/recommendations?notificationId=' + notices[0].id, { cookies: manager });
    assert.equal(batch.status, 200);
    assert.deepEqual((await batch.json()).map((item: { recommendationId: number }) => item.recommendationId),
      [recommendation.recommendationId]);
    assert.equal((await request('/recommendations?notificationId=' + notices[0].id, { cookies: context.head })).status, 404);
    const foreign = await db.systemNotification.findFirstOrThrow({ where: {
      userId: accounts.admin.userId, title: notices[0].title, message: notices[0].message,
    } });
    assert.equal((await request('/recommendations?notificationId=' + foreign.id, { cookies: manager })).status, 404);
  });
}
