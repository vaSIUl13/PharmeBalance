import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { PrismaClient, type Prisma } from '@prisma/client';
import { closeDemoDay, closeLockedDay, latestDemoDay } from '../src/modules/demo-day/demo-close';
import type { DailyReport } from '../src/modules/demo-day/demo-report';
import { basePolicy } from '../src/modules/forecasts/forecast-model';
import { publishSnapshot } from '../src/modules/forecasts/forecast-run';
import { applyDemoStockPulse } from '../src/modules/demo-day/demo-intraday';
import { generateRecommendations } from '../src/modules/recommendations/generate';

test('a demo report atomically closes one day, preserves reservations and advances forecasting', async t => {
  const url = process.env.AUTH_TEST_DATABASE_URL;
  assert(url && new URL(url).pathname.endsWith('_test'));
  const db = new PrismaClient({ datasourceUrl: url });
  t.after(() => db.$disconnect());
  const code = 'D' + randomBytes(5).toString('hex');
  const directory = await mkdtemp(join(tmpdir(), 'pharme-demo-day-'));
  const archive = resolve(directory, createHash('sha256').update(code).digest('hex').slice(0, 12));
  const previousDirectory = process.env.DEMO_REPORT_DIR;
  process.env.DEMO_REPORT_DIR = directory;
  t.after(async () => {
    if (previousDirectory === undefined) delete process.env.DEMO_REPORT_DIR;
    else process.env.DEMO_REPORT_DIR = previousDirectory;
    const files = await readdir(archive).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (files) {
      for (const file of files) await unlink(join(archive, file));
      await rmdir(archive);
    }
    await rmdir(directory);
  });
  const initialDay = '2070-01-01';
  const day = '2070-01-02';
  await assert.rejects(closeDemoDay(db, { through: day, policy: basePolicy }), /requires a database ending in _demo/);
  const rollback = new Error('rollback demo-day fixtures');
  await assert.rejects(db.$transaction(async tx => {
    const { pharmacyId } = await tx.pharmacy.create({ data: {
      code, name: code, address: 'Test', city: 'Test', latitude: 49, longitude: 24, isActive: true, isSynthetic: true,
    } });
    const { userId } = await tx.userAccount.create({ data: {
      login: code, email: code + '@example.invalid', firstName: 'Demo', lastName: 'Fixture', passwordHash: 'disabled',
      isActive: false, role: { connect: { code: 'head' } },
    } });
    await tx.userPharmacy.create({ data: { userId, pharmacyId } });
    const { drugId } = await tx.drug.create({ data: { sku: code, name: code, unit: 'pack', dosageForm: 'tablet' } });
    const { stockId } = await tx.stockItem.create({ data: { pharmacyId, drugId, quantity: 9, reservedQuantity: 4, msl: 4, maxLevel: 16 } });
    const realPharmacy = await tx.pharmacy.create({ data: {
      code: code + 'R', name: 'Non-demo fixture', address: 'Test', city: 'Test', latitude: 49, longitude: 24, isActive: true,
    } });
    const realStock = await tx.stockItem.create({ data: { pharmacyId: realPharmacy.pharmacyId, drugId, quantity: 17, maxLevel: 20 } });
    const { importId } = await tx.importBatch.create({ data: { pharmacyId, uploadedBy: userId, dataType: 'SALES',
      sourceFormat: 'JSON', fileName: 'seed', recordsTotal: 1, isSynthetic: true } });
    await tx.sale.create({ data: { stockId, importId, saleDate: new Date(initialDay), quantity: 5, unitPrice: '35.00' } });
    assert.equal(await latestDemoDay(tx), initialDay);
    assert.equal((await closeLockedDay(tx, code, { through: initialDay, policy: basePolicy })).status, 'up-to-date');
    assert.equal((await closeLockedDay(tx, code, { through: day, expected: '2070-01-03', policy: basePolicy })).status, 'out-of-order');
    const result = await closeLockedDay(tx, code, { through: day, expected: day, policy: basePolicy });
    assert.equal(result.status, 'closed');
    if (result.status !== 'closed') throw new Error('Day was not closed');
    const report: DailyReport = JSON.parse(await readFile(join(archive, result.fileName), 'utf8'));
    assert.equal(report.synthetic, true);
    assert.equal(report.day, day);
    const row = report.rows.find(item => item.stockId === stockId);
    assert(row);
    const sale = await tx.sale.findUniqueOrThrow({ where: { stockId_saleDate: { stockId, saleDate: new Date(day) } }, include: { import: true } });
    assert.equal(sale.quantity, row.sold);
    assert.equal(sale.returnedQuantity, row.returned);
    assert.equal(sale.import.checksum, result.checksum);
    assert.equal(sale.import.status, 'APPLIED');
    const stock = await tx.stockItem.findUniqueOrThrow({ where: { stockId } });
    assert.equal(stock.quantity, row.closing);
    assert.equal(stock.reservedQuantity, 4);
    assert.equal(await tx.sale.count({ where: { stockId: realStock.stockId } }), 0);
    assert.equal((await tx.stockItem.findUniqueOrThrow({ where: { stockId: realStock.stockId } })).quantity, 17);
    assert.equal(await latestDemoDay(tx), day);
    const forecast = await tx.forecast.findUniqueOrThrow({ where: { runId_stockId: { runId: result.runId, stockId } } });
    assert.equal(forecast.quantity, row.closing);
    assert(forecast.createdAt >= stock.quantityAsOf);
    assert.equal((await closeLockedDay(tx, code, { through: day, expected: day, policy: basePolicy })).status, 'already-updated');
    assert.equal(await tx.importBatch.count({ where: { pharmacyId, syntheticKey: { startsWith: 'demo-day:' } } }), 2);
    await verifyIntradayChange(tx, { code, day, pharmacyId, realStockId: realStock.stockId });
    throw rollback;
  }, { timeout: 30_000 }), error => error === rollback);
  assert.equal(await db.pharmacy.count({ where: { code } }), 0);
});

async function verifyIntradayChange(tx: Prisma.TransactionClient, fixture: {
  code: string; day: string; pharmacyId: number; realStockId: number;
}) {
  const { code, day, pharmacyId, realStockId } = fixture;
  const { pharmacyId: donorPharmacyId } = await tx.pharmacy.create({ data: { code: code + 'D', name: 'Demo donor',
    address: 'Test', city: 'Test', latitude: 49.01, longitude: 24, isSynthetic: true } });
  const { drugId } = await tx.drug.create({ data: { sku: code + 'P', name: 'Pulse fixture', unit: 'pack', dosageForm: 'tablet' } });
  const recipient = await tx.stockItem.create({ data: { pharmacyId, drugId, quantity: 10, msl: 4, maxLevel: 14, reservedQuantity: 2 } });
  await tx.stockItem.create({ data: { pharmacyId: donorPharmacyId, drugId, quantity: 25, maxLevel: 10 } });
  const slot = new Date('2070-01-02T18:00:00Z');
  await publishSnapshot(tx, new Date(day), true, basePolicy, slot);
  assert.equal(await applyDemoStockPulse(tx, code, slot, slot), 1);
  assert.equal(await applyDemoStockPulse(tx, code, slot, slot), 0);
  const adjusted = await tx.stockItem.findUniqueOrThrow({ where: { stockId: recipient.stockId } });
  assert.equal(adjusted.quantity, 3);
  assert.equal(adjusted.reservedQuantity, 2);
  assert.equal((await tx.stockItem.findUniqueOrThrow({ where: { stockId: realStockId } })).quantity, 17);
  assert.equal(await tx.sale.count({ where: { stockId: recipient.stockId } }), 0);
  assert.equal(await latestDemoDay(tx), day);
  const published = await publishSnapshot(tx, new Date(day), true, basePolicy, slot);
  assert.equal(published.reused, false);
  const risk = await tx.risk.findFirstOrThrow({ where: { forecast: { runId: published.runId, stockId: recipient.stockId } } });
  assert.equal(risk.riskLevel, 'HIGH');
  assert.equal((await generateRecommendations(tx, published.runId, true)).created, 1);
}
