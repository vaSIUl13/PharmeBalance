import { Prisma, type PrismaClient } from '@prisma/client';
import { publishSnapshot } from '../forecasts/forecast-run';
import type { Policy } from '../forecasts/forecast-model';
import { administrators, networkManagers } from '../notifications/business-notifications';
import { notifyUsers } from '../notifications/inbox.service';
import { generateRecommendations } from '../recommendations/generate';
import { archiveReport, dayString, kyivDate, nextDay, simulatePosition, type DailyReport, type SimulatedStock } from './demo-report';

const transactionOptions = { timeout: 300_000, maxWait: 10_000 };
const chunkSize = 1000;
export const isDemoDatabase = (url?: string) => Boolean(url && new URL(url).pathname.endsWith('_demo'));

export async function latestDemoDay(tx: Prisma.TransactionClient) {
  const sale = await tx.sale.findFirst({
    where: { stock: { pharmacy: { isSynthetic: true } },
      import: { isSynthetic: true, dataType: 'SALES', status: { not: 'REJECTED' } } },
    orderBy: { saleDate: 'desc' }, select: { saleDate: true },
  });
  return sale ? dayString(sale.saleDate) : null;
}

export async function withDemoLock<T>(db: PrismaClient, work: (tx: Prisma.TransactionClient, database: string) => Promise<T>) {
  return db.$transaction(async tx => {
    const [row] = await tx.$queryRaw<{ database: string }[]>`SELECT current_database() AS database`;
    if (!row.database.endsWith('_demo')) throw new Error('Daily simulation requires a database ending in _demo');
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('pharmabalance:demo-day'))) AS day_lock`;
    return work(tx, row.database);
  }, transactionOptions);
}

async function forecast(tx: Prisma.TransactionClient, day: string, policy: Policy, capturedAt?: Date) {
  const result = await publishSnapshot(tx, new Date(day), true, policy, capturedAt);
  const recommendations = await generateRecommendations(tx, result.runId, true);
  return { ...result, recommendations };
}

export function refreshDemoForecast(db: PrismaClient, policy: Policy, expected?: string) {
  return withDemoLock(db, async tx => {
    const day = await latestDemoDay(tx);
    if (!day || expected && expected !== day) throw new Error('Use the final sales day of the demo inventory snapshot');
    await lockDemoPharmacies(tx);
    await tx.$queryRaw`SELECT s.stock_id FROM stock_item s JOIN pharmacy p USING (pharmacy_id)
      JOIN drug d USING (drug_id) WHERE p.is_synthetic AND p.is_active AND d.is_active
      ORDER BY s.stock_id FOR UPDATE OF s`;
    const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp()::timestamptz(3) AS now`;
    if (day > kyivDate(clock.now).date) throw new Error('Future forecast cutoff');
    return { day, synthetic: true, ...await forecast(tx, day, policy, clock.now) };
  });
}

function lockDemoPharmacies(tx: Prisma.TransactionClient) {
  return tx.$queryRaw`SELECT pharmacy_id FROM pharmacy WHERE is_synthetic AND is_active ORDER BY pharmacy_id FOR SHARE`;
}

async function lockDemoStock(tx: Prisma.TransactionClient, day: string) {
  await lockDemoPharmacies(tx);
  return tx.$queryRaw<SimulatedStock[]>`
    SELECT s.stock_id AS "stockId", s.pharmacy_id AS "pharmacyId", d.sku, s.quantity, s.reserved_quantity AS reserved,
      s.msl, s.max_level AS "maxLevel", history.average, history.price AS "unitPrice"
    FROM stock_item s
    JOIN pharmacy p USING (pharmacy_id) JOIN drug d USING (drug_id)
    LEFT JOIN LATERAL (
      SELECT AVG(a.quantity - a.returned_quantity) FILTER (WHERE a.stockout IS DISTINCT FROM TRUE)::double precision AS average,
        (array_agg(a.unit_price ORDER BY a.sale_date DESC) FILTER (WHERE a.unit_price IS NOT NULL))[1]::text AS price
      FROM sale a JOIN import_batch b USING (import_id)
      WHERE a.stock_id = s.stock_id AND b.is_synthetic AND b.status <> 'REJECTED' AND b.pharmacy_id = s.pharmacy_id
        AND a.sale_date >= ${day}::date - 28 AND a.sale_date < ${day}::date
    ) history ON TRUE
    WHERE p.is_synthetic AND p.is_active AND d.is_active
    ORDER BY s.stock_id FOR UPDATE OF s`;
}

async function applyDemoReport(tx: Prisma.TransactionClient, report: DailyReport,
  archive: { checksum: string; fileName: string }, closedAt: Date) {
  const pharmacies = new Map<number, (DailyReport['rows'][number] & { sourceRow: number })[]>();
  for (const [index, row] of report.rows.entries()) {
    const group = pharmacies.get(row.pharmacyId) ?? [];
    group.push({ ...row, sourceRow: index + 1 });
    pharmacies.set(row.pharmacyId, group);
  }
  const uploaders = await tx.importBatch.findMany({
    where: { isSynthetic: true, dataType: 'SALES', pharmacyId: { in: [...pharmacies.keys()] } },
    distinct: ['pharmacyId'], orderBy: { importId: 'asc' }, select: { pharmacyId: true, uploadedBy: true },
  });
  const uploaderByPharmacy = new Map(uploaders.map(row => [row.pharmacyId, row.uploadedBy]));
  const saleDate = new Date(report.day);
  for (const [pharmacyId, rows] of pharmacies) {
    const uploadedBy = uploaderByPharmacy.get(pharmacyId);
    if (uploadedBy === undefined) throw new Error(`Demo seed is missing an uploader for pharmacy ${pharmacyId}`);
    const batch = {
      uploadedBy, pharmacyId, sourceFormat: 'JSON', isSynthetic: true, status: 'APPLIED', ...archive,
      recordsTotal: rows.length, recordsApplied: rows.length, snapshotAt: closedAt, uploadedAt: closedAt,
    } as const;
    const key = `demo-day:${report.day}:${pharmacyId}`;
    const sales = await tx.importBatch.create({ data: { ...batch, dataType: 'SALES', syntheticKey: key + ':sales' } });
    await tx.importBatch.create({ data: { ...batch, dataType: 'STOCKS', syntheticKey: key + ':stocks' } });
    for (let i = 0; i < rows.length; i += chunkSize) {
      const page = rows.slice(i, i + chunkSize);
      await tx.sale.createMany({ data: page.map(({ stockId, sold, returned, stockout, unitPrice, sourceRow }) => ({
        stockId, saleDate, importId: sales.importId, quantity: sold, returnedQuantity: returned,
        sourceRow, stockout, unitPrice,
      })) });
      await tx.$executeRaw`
        UPDATE stock_item s SET quantity = r.closing, quantity_as_of = GREATEST(s.quantity_as_of, ${closedAt}),
          updated_at = GREATEST(s.updated_at, ${closedAt})
        FROM jsonb_to_recordset(${JSON.stringify(page)}::jsonb) AS r("stockId" int, closing int)
        WHERE s.stock_id = r."stockId"`;
    }
  }
  return pharmacies.size;
}

type CloseInput = { through: string; expected?: string; policy: Policy };

export function closeDemoDay(db: PrismaClient, input: CloseInput) {
  return withDemoLock(db, (tx, database) => closeLockedDay(tx, database, input));
}

export async function closeLockedDay(tx: Prisma.TransactionClient, database: string, input: CloseInput) {
  const previous = await latestDemoDay(tx);
  if (!previous) return { status: 'no-seed' } as const;
  const day = nextDay(previous);
  if (input.expected && input.expected < day) return { status: 'already-updated', day: previous } as const;
  if (input.expected && input.expected > day) return { status: 'out-of-order', day: previous, nextDay: day } as const;
  if (day > input.through) return { status: 'up-to-date', day: previous } as const;
  const stocks = await lockDemoStock(tx, day);
  if (!stocks.length) return { status: 'no-active-stock', day: previous } as const;
  const report: DailyReport = { kind: 'pharmabalance-demo-day-v1', synthetic: true, day,
    rows: stocks.map(stock => simulatePosition(stock, day)) };
  const archive = await archiveReport(database, report);
  const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp()::timestamptz(3) AS now`;
  const pharmacies = await applyDemoReport(tx, report, archive, clock.now);
  const [latest] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp()::timestamptz(3) AS now`;
  const result = await forecast(tx, day, input.policy, latest.now);
  const totals = report.rows.reduce((sum, row) => ({
    sold: sum.sold + row.sold, received: sum.received + row.received, returned: sum.returned + row.returned,
  }), { sold: 0, received: 0, returned: 0 });
  await notifyUsers(tx, { OR: [administrators, networkManagers] }, {
    title: 'Закрито день у demo', message: `${day} · аптек: ${pharmacies}, продано: ${totals.sold}, надійшло: ${totals.received}, повернено: ${totals.returned}.`,
  });
  return { status: 'closed', day, pharmacies, positions: stocks.length, ...totals, ...archive, ...result } as const;
}
