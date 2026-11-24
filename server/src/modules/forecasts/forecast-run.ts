import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { basePolicy, calculate, classifyPharmacy, dayMs, modelVersion, type DailySale, type Policy } from './forecast-model';
import { notifyForecastChanges } from './forecast-notifications';

export async function publishSnapshot(tx: Prisma.TransactionClient, asOf: Date, synthetic: boolean, policy: Policy) {
  const start = new Date(+asOf - (policy.historyDays - 1) * dayMs);
  const [input] = await tx.$queryRaw<{ stockKey: string | null; salesKey: string | null }[]>`
    WITH eligible AS (
      SELECT s.stock_id, s.pharmacy_id, s.quantity, s.msl, s.max_level, s.quantity_as_of, s.updated_at FROM stock_item s
      JOIN pharmacy p USING(pharmacy_id) JOIN drug d USING(drug_id)
      WHERE p.is_synthetic = ${synthetic} AND p.is_active AND d.is_active
    ), batches AS (
      SELECT DISTINCT s.import_id FROM sale s JOIN eligible e USING(stock_id)
      JOIN import_batch b USING(import_id)
      WHERE s.sale_date BETWEEN ${start}::date AND ${asOf}::date AND b.is_synthetic = ${synthetic}
        AND b.status <> 'REJECTED' AND b.data_type = 'продажі'
    )
    SELECT (SELECT md5(string_agg(e::text, ',' ORDER BY stock_id)) FROM eligible e) AS "stockKey",
           (SELECT md5(string_agg(import_id::text, ',' ORDER BY import_id)) FROM batches) AS "salesKey"`;
  const key = createHash('sha256').update(JSON.stringify([policy, input])).digest('hex');
  const latest = await tx.forecastRun.findFirst({ where: { asOf, synthetic }, orderBy: { id: 'desc' } });
  const fingerprint = modelVersion + ':' + key;
  if (latest?.version.split('@')[0] === fingerprint) return { runId: latest.id, reused: true };
  const previous = latest ?? await tx.forecastRun.findFirst({ where: { synthetic, asOf: { lt: asOf } },
    orderBy: [{ asOf: 'desc' }, { id: 'desc' }] });
  const newer = await tx.forecastRun.findFirst({ where: { synthetic, asOf: { gt: asOf } }, select: { id: true } });
  const identity = { asOf, synthetic, version: fingerprint + '@' + (latest?.id ?? 0) };
  const inserted = await tx.forecastRun.createMany({ data: { ...identity, policy }, skipDuplicates: true });
  const run = await tx.forecastRun.findUniqueOrThrow({ where: { asOf_synthetic_version: identity } });
  if (!inserted.count) return { runId: run.id, reused: true };
  const pharmacies = await tx.pharmacy.findMany({ where: { isActive: true, isSynthetic: synthetic }, select: { pharmacyId: true } });
  for (const { pharmacyId } of pharmacies) {
    const stocks = await tx.stockItem.findMany({ where: { pharmacyId, drug: { isActive: true } },
      select: { stockId: true, quantity: true, msl: true, maxLevel: true } });
    if (!stocks.length) continue;
    const sales = await tx.$queryRaw<(DailySale & { stockId: number })[]>`
      SELECT s.stock_id AS "stockId", s.sale_date AS "saleDate", s.quantity, s.returned_quantity AS "returnedQuantity",
             (s.unit_price * 100)::bigint AS cents, s.stockout
        FROM sale s JOIN stock_item i USING(stock_id) JOIN import_batch b USING(import_id)
       WHERE i.pharmacy_id = ${pharmacyId} AND b.pharmacy_id = i.pharmacy_id
         AND b.is_synthetic = ${synthetic} AND b.status <> 'REJECTED' AND b.data_type = 'продажі'
         AND s.sale_date BETWEEN ${start}::date AND ${asOf}::date`;
    const grouped = new Map<number, DailySale[]>();
    for (const sale of sales) {
      const group = grouped.get(sale.stockId);
      if (group) group.push(sale);
      else grouped.set(sale.stockId, [sale]);
    }
    const results = stocks.map(stock => calculate(stock, grouped.get(stock.stockId) ?? [], asOf, policy));
    classifyPharmacy(results, policy);
    const forecasts = await tx.forecast.createManyAndReturn({
      data: results.map(({ turnover, daysToStockout, ...r }) => ({ ...r, runId: run.id, modelVersion, horizonDays: policy.horizonDays })),
      select: { forecastId: true, stockId: true },
    });
    const ids = new Map(forecasts.map(f => [f.stockId, f.forecastId]));
    const risks: Prisma.RiskCreateManyInput[] = [];
    for (const f of results) {
      const prob = f.shortageProbability ?? 0;
      const alreadyBelow = f.quantity < f.msl;
      const shortage = alreadyBelow || prob > 0 || f.daysToStockout !== null;
      if (shortage || f.currentSurplus > 0) {
        risks.push({ forecastId: ids.get(f.stockId)!, positionType: shortage ? 'SHORTAGE' : 'SURPLUS',
          riskLevel: alreadyBelow || prob >= policy.highRisk ? 'HIGH' : prob >= policy.mediumRisk ? 'MEDIUM' : 'LOW',
          surplusQuantity: f.currentSurplus, daysToStockout: f.daysToStockout });
      }
    }
    if (risks.length) await tx.risk.createMany({ data: risks });
    await tx.$executeRaw`UPDATE stock_item s SET abc_class = f.abc_class, xyz_class = f.xyz_class
      FROM forecast f WHERE f.run_id = ${run.id} AND f.stock_id = s.stock_id AND s.pharmacy_id = ${pharmacyId}
        AND (s.abc_class,s.xyz_class) IS DISTINCT FROM (f.abc_class,f.xyz_class)`;
  }
  if (!newer) await notifyForecastChanges(tx, run.id, previous?.id);
  return { runId: run.id, reused: false };
}

export async function calculateRun(db: PrismaClient, asOf: Date, synthetic: boolean, policy = basePolicy) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(tx => publishSnapshot(tx, asOf, synthetic, policy), {
        isolationLevel: 'Serializable', timeout: 300000,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2)) throw error;
    }
  }
}
