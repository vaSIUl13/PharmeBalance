import type { Prisma } from '@prisma/client';
import { activeTransfers } from '../recommendations/generate';
import { haversine, transferLimit } from '../recommendations/donor-selection';
import { archiveDemoJson } from './demo-report';

const positionsPerSlot = 3;
const maxStockQuantity = 2_147_483_647;

export async function applyDemoStockPulse(tx: Prisma.TransactionClient, database: string, slot: Date, now: Date) {
  const slotId = slot.toISOString().slice(0, 16);
  const key = `demo-intraday:${slotId}:`;
  if (await tx.importBatch.findFirst({ where: { syntheticKey: { startsWith: key } }, select: { importId: true } })) return 0;
  const run = await tx.forecastRun.findFirst({ where: { synthetic: true }, orderBy: [{ asOf: 'desc' }, { id: 'desc' }], select: { id: true } });
  if (!run) return 0;
  const active = { pharmacy: { isActive: true, isSynthetic: true }, drug: { isActive: true } };
  const stocks = await tx.stockItem.findMany({ where: active, include: {
    pharmacy: { select: { latitude: true, longitude: true } }, drug: { select: { sku: true } },
  }, orderBy: { stockId: 'asc' } });
  const snapshot = await tx.forecast.findMany({ where: { runId: run.id }, select: {
    stockId: true, predictedDemand: true, risk: { select: { positionType: true, riskLevel: true } },
  } });
  const byStock = new Map(snapshot.map(row => [row.stockId, row]));
  const open = await tx.recommendation.findMany({ where: { recipientStock: active, OR: [
    { status: { in: [...activeTransfers] } }, { status: 'CREATED', forecast: { runId: run.id } },
  ] }, select: { recipientStockId: true, donorStockId: true, status: true, quantity: true } });
  const occupied = new Set(open.flatMap(row => [row.recipientStockId, row.donorStockId]));
  const proposed = new Map<number, number>();
  for (const row of open) if (row.status === 'CREATED') {
    proposed.set(row.donorStockId, (proposed.get(row.donorStockId) ?? 0) + row.quantity);
  }
  const uploaders = await tx.importBatch.findMany({ where: { isSynthetic: true, dataType: 'SALES',
    status: { not: 'REJECTED' },
    pharmacyId: { in: [...new Set(stocks.map(stock => stock.pharmacyId))] },
  }, distinct: ['pharmacyId'], orderBy: { importId: 'asc' }, select: { pharmacyId: true, uploadedBy: true } });
  const uploaderByPharmacy = new Map(uploaders.map(row => [row.pharmacyId, row.uploadedBy]));
  const donors = new Map<number, typeof stocks>();
  for (const stock of stocks) {
    const group = donors.get(stock.drugId) ?? [];
    group.push(stock);
    donors.set(stock.drugId, group);
  }
  const limit = transferLimit();
  const point = (stock: typeof stocks[number]) => ({ latitude: Number(stock.pharmacy.latitude), longitude: Number(stock.pharmacy.longitude) });
  const offset = Math.floor(+slot / (30 * 60_000)) % Math.max(1, stocks.length);
  const usedSkus = new Set<number>();
  const changes: { stockId: number; pharmacyId: number; uploadedBy: number; sku: string; opening: number; closing: number }[] = [];
  let risks = 0;
  for (const stock of [...stocks.slice(offset), ...stocks.slice(0, offset)]) {
    const forecast = byStock.get(stock.stockId);
    const uploadedBy = uploaderByPharmacy.get(stock.pharmacyId);
    if (!forecast || uploadedBy === undefined || occupied.has(stock.stockId) || usedSkus.has(stock.drugId) ||
        stock.msl <= stock.reservedQuantity || stock.quantity < stock.msl || stock.quantityAsOf > now ||
        stock.quantity - stock.msl >= limit ||
        forecast.risk?.positionType === 'SHORTAGE' && forecast.risk.riskLevel === 'HIGH') continue;
    const quantity = Math.min(limit, 1 + Math.ceil(Number(forecast.predictedDemand ?? 0)));
    const candidates = donors.get(stock.drugId)?.filter(donor => donor.stockId !== stock.stockId &&
      donor.quantityAsOf <= now && haversine(point(stock), point(donor)) !== null) ?? [];
    const target = (donor: typeof stock) => donor.maxLevel + donor.reservedQuantity + (proposed.get(donor.stockId) ?? 0) + quantity;
    if (!candidates.some(donor => donor.quantity >= target(donor))) {
      const supplier = candidates.find(donor => !occupied.has(donor.stockId) && uploaderByPharmacy.has(donor.pharmacyId) &&
        target(donor) <= maxStockQuantity && target(donor) - donor.quantity <= limit);
      if (!supplier) continue;
      changes.push({ stockId: supplier.stockId, pharmacyId: supplier.pharmacyId, sku: supplier.drug.sku,
        uploadedBy: uploaderByPharmacy.get(supplier.pharmacyId)!, opening: supplier.quantity, closing: target(supplier) });
    }
    changes.push({ stockId: stock.stockId, pharmacyId: stock.pharmacyId, sku: stock.drug.sku, uploadedBy,
      opening: stock.quantity, closing: stock.msl - 1 });
    usedSkus.add(stock.drugId);
    if (++risks === positionsPerSlot) break;
  }
  if (!changes.length) return 0;
  const file = await archiveDemoJson(database, 'demo-intraday-' + slotId.replace(':', '-'), {
    kind: 'pharmabalance-demo-stock-adjustment-v1', synthetic: true, slot: slot.toISOString(),
    rows: changes.map(({ stockId, pharmacyId, sku, opening, closing }) => ({
      stockId, pharmacyId, sku, opening, withdrawn: Math.max(0, opening - closing), received: Math.max(0, closing - opening), closing,
    })),
  });
  const groups = new Map<number, typeof changes>();
  for (const row of changes) {
    const group = groups.get(row.pharmacyId) ?? [];
    group.push(row);
    groups.set(row.pharmacyId, group);
  }
  for (const [pharmacyId, rows] of groups) {
    await tx.importBatch.create({ data: { ...file, pharmacyId, uploadedBy: rows[0].uploadedBy,
      dataType: 'STOCKS', sourceFormat: 'JSON', status: 'APPLIED', isSynthetic: true, syntheticKey: key + pharmacyId,
      recordsTotal: rows.length, recordsApplied: rows.length, snapshotAt: now, uploadedAt: now,
    } });
  }
  for (const row of changes) await tx.stockItem.update({ where: { stockId: row.stockId }, data: { quantity: row.closing, updatedAt: now } });
  return risks;
}
