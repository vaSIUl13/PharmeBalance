import type { ReportScenario } from './redistribution';
import type { TestContext } from 'node:test';
import type { TransferFixture } from './fixture';
import assert = require('node:assert/strict');
import { Workbook } from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { metrics } from '../../src/modules/reports/report-format';

export async function testReports(t: TestContext, context: TransferFixture, transfer: ReportScenario) {
  const { db, run, forecastRunIds, transferIds, request, manager, head, admin } = context;
  const { id, recipientPharmacy, recipientId, donorId, logist } = transfer;
  await t.test('period report matches SQL milestones and both downloads', async () => {
    const [{ day }] = await db.$queryRaw<{ day: string }[]>`SELECT to_char(now() AT TIME ZONE 'Europe/Kyiv', 'YYYY-MM-DD') AS day`;
    const path = '?from=' + day + '&to=' + day + '&pharmacyId=' + recipientPharmacy;
    const response = await request('/reports/summary' + path, { cookies: manager });
    assert.equal(response.status, 200, await response.clone().text());
    const report = await response.json();
    assert.equal(report.period.timeZone, 'Europe/Kyiv');
    const [control] = await db.$queryRaw<{ completed: number; units: number }[]>`SELECT count(*)::int AS completed, sum(a.quantity)::int AS units
      FROM recommendation_action a JOIN action_type t USING(action_type_id)
      WHERE t.code='RECEIVE' AND a.recommendation_id=${id} AND
        (a.action_time AT TIME ZONE 'Europe/Kyiv')::date=${day}::date`;
    assert.equal(report.totals.completed, control.completed);
    assert.equal(report.totals.movedUnits, control.units);
    assert.equal(report.totals.movedUnits, 100);
    assert(report.totals.confirmed >= 1 && report.totals.dispatched === 1);
    for (const session of [head, logist, admin]) {
      assert.equal((await request('/reports/summary' + path, { cookies: session })).status, 403);
    }
    assert.equal((await request('/reports/summary?from=2026-02-30&to=2026-03-01', { cookies: manager })).status, 400);
    const csv = await request('/reports/export' + path + '&format=csv', { cookies: manager });
    assert.equal(csv.status, 200, await csv.clone().text());
    const csvValues = new Map(parseCsv(await csv.text(), { bom: true }).map(([key, value]) => [key, value] as const));
    const xlsx = await request('/reports/export' + path + '&format=xlsx', { cookies: manager });
    assert.equal(xlsx.status, 200);
    const workbook = new Workbook();
    await workbook.xlsx.load(await xlsx.arrayBuffer());
    const xlsxValues = new Map();
    const sheet = workbook.getWorksheet(1);
    assert(sheet);
    sheet.eachRow(row => xlsxValues.set(row.getCell(1).value, row.getCell(2).value));
    for (const [key, label] of Object.entries(metrics)) {
      assert.equal(csvValues.get(label), String(report.totals[key]));
      assert.equal(xlsxValues.get(label), report.totals[key]);
    }
    const empty = await request('/reports/summary?from=1900-01-01&to=1900-01-01', { cookies: manager });
    assert(Object.values((await empty.json()).totals).every(value => value === 0));
    const latest = await db.forecastRun.create({ data: { asOf: new Date('2004-03-28'), synthetic: false, version: run, policy: {} } });
    const revised = await db.forecastRun.create({ data: { asOf: latest.asOf, synthetic: false, version: run + '-r', policy: {} } });
    forecastRunIds.push(latest.id, revised.id);
    await db.forecast.createMany({ data: [latest.id, revised.id].map(runId => ({
      runId, stockId: recipientId, modelVersion: 'fixture', shortageProbability: 0.5, currentSurplus: 5,
    })) });
    const daily = await request('/reports/summary?from=2004-03-28&to=2004-03-28&pharmacyId=' + recipientPharmacy, { cookies: manager });
    const { totals } = await daily.json();
    assert.deepEqual([totals.shortageRisks, totals.surplusPositions], [1, 1]);
    for (const timestamp of ['2004-03-27T21:59:59.999Z', '2004-03-27T22:00:00Z',
      '2004-03-28T20:59:59.999Z', '2004-03-28T21:00:00Z']) {
      const boundary = await db.recommendation.create({ data: { donorStockId: donorId, recipientStockId: recipientId,
        quantity: 1, priority: 4, createdAt: new Date(timestamp), status: 'CANCELLED' } });
      transferIds.push(boundary.recommendationId);
    }
    const bounds = await request('/reports/summary?from=2004-03-28&to=2004-03-28&pharmacyId=' + recipientPharmacy, { cookies: manager });
    assert.equal((await bounds.json()).totals.recommendations, 2);
  });
}
