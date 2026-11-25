import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { TransferFixture } from './fixture';

export async function testRiskOrdering(t: TestContext, fixture: TransferFixture) {
  await t.test('risk severity precedes probability across cursor pages', async () => {
    const { db, run, manager, stockIds, forecastRunIds, request } = fixture;
    const asOf = '2000-01-02';
    const snapshot = await db.forecastRun.create({
      data: { asOf: new Date(asOf), synthetic: false, version: 'severity-' + run, policy: {} },
    });
    forecastRunIds.push(snapshot.id);
    const forecasts = await Promise.all([null, 0.35].map((shortageProbability, index) => db.forecast.create({
      data: { stockId: stockIds[index], runId: snapshot.id, modelVersion: run, quantity: index ? 10 : 0,
        msl: 5, shortageProbability },
    })));
    await db.risk.createMany({ data: forecasts.map(({ forecastId }, index) => ({
      forecastId, positionType: 'SHORTAGE', riskLevel: index ? 'MEDIUM' : 'HIGH',
    })) });
    const ids = forecasts.map(row => row.forecastId);
    const page = async (suffix = '') => {
      const response = await request('/risks?asOf=' + asOf + suffix, { cookies: manager });
      assert.equal(response.status, 200);
      const { items } = await response.json() as { items: { forecastId: number }[] };
      return items.map(row => row.forecastId);
    };
    assert.deepEqual(await page(), ids);
    assert.deepEqual(await page('&after=' + ids[0]), ids.slice(1));
  });
}
