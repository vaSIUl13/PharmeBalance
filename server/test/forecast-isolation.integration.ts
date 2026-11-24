import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { basePolicy } from '../src/modules/forecasts/forecast-model';
import { publishSnapshot } from '../src/modules/forecasts/forecast-run';

test('foreign-source sales are excluded; actual shortage survives insufficient history', async (t) => {
  const url = process.env.AUTH_TEST_DATABASE_URL;
  assert(url && new URL(url).pathname.endsWith('_test'));
  const db = new PrismaClient({ datasourceUrl: url });
  t.after(() => db.$disconnect());

  const code = randomBytes(6).toString('hex');
  const rollback = new Error('rollback test fixtures');
  await assert.rejects(db.$transaction(async (tx) => {
    const { pharmacyId } = await tx.pharmacy.create({ data: {
      name: code, code, address: 'Test', city: 'Test',
      latitude: 49, longitude: 24, isActive: true, isSynthetic: true,
    } });
    const { drugId } = await tx.drug.create({ data: { sku: code, name: code, unit: 'box', dosageForm: 'tablet' } });
    const { userId } = await tx.userAccount.create({ data: {
      email: code + '@example.invalid', login: code, firstName: 'Test',
      lastName: 'Test', passwordHash: 'disabled', role: { connect: { code: 'head' } },
    } });
    await tx.userPharmacy.create({ data: { userId, pharmacyId } });
    const { stockId } = await tx.stockItem.create({ data: { pharmacyId, drugId, quantity: 0, msl: 2, maxLevel: 4 } });
    const { importId } = await tx.importBatch.create({ data: {
      pharmacyId, uploadedBy: userId, dataType: 'SALES', sourceFormat: 'CSV',
      fileName: 'fixture.csv', recordsTotal: 1, status: 'APPLIED',
    } });
    const day = new Date('2090-01-01');
    await tx.sale.create({ data: { stockId, importId, saleDate: day, quantity: 50 } });

    const run = await publishSnapshot(tx, day, true, basePolicy);
    const row = await tx.forecast.findUniqueOrThrow({
      where: { runId_stockId: { runId: run.runId, stockId } },
      include: { risk: true },
    });
    assert(row.quality && typeof row.quality === 'object' && !Array.isArray(row.quality));
    assert.equal(row.quality.observedDays, 0);
    assert.equal(row.shortageProbability, null);
    assert.equal(row.predictedDemand, null);
    assert.ok(row.risk);
    assert.equal(row.risk.positionType, 'SHORTAGE');
    assert.equal(row.risk.riskLevel, 'HIGH');
    assert.equal((await publishSnapshot(tx, day, true, basePolicy)).reused, true);
    const inbox = () => tx.systemNotification.findMany({ where: { userId }, orderBy: { id: 'asc' } });
    const first = await inbox();
    assert.equal(first.length, 1);
    assert.match(first[0].message, /Нових: 1, посилилися: 0, зникли: 0/);
    await tx.stockItem.update({ where: { stockId }, data: { quantity: 4 } });
    await publishSnapshot(tx, day, true, basePolicy);
    const after = await inbox();
    assert.equal(after.length, 2);
    assert.match(after[1].message, /Нових: 0, посилилися: 0, зникли: 1/);
    const tomorrow = new Date('2090-01-02');
    await publishSnapshot(tx, tomorrow, true, basePolicy);
    assert.equal((await inbox()).length, 2);
    throw rollback;
  }, { timeout: 30000 }), (error) => error === rollback);
});
