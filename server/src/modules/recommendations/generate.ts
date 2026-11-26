import { NotFoundException } from '@nestjs/common';
import { Prisma, Source } from '@prisma/client';
import { haversine, nearest, transferLimit } from './donor-selection';
import { administrators, networkManagers } from '../notifications/business-notifications';
import { notifyUsers } from '../notifications/inbox.service';

const stockInclude = { pharmacy: true, drug: { select: { isActive: true } } } satisfies Prisma.StockItemInclude;
export const activeTransfers = ['CONFIRMED', 'IN_PROGRESS'] as const;

export async function generateRecommendations(tx: Prisma.TransactionClient, runId: number, synthetic: boolean) {
  await tx.$queryRaw`SELECT id FROM forecast_run WHERE id = ${runId} FOR UPDATE`;
  const run = await tx.forecastRun.findFirst({ where: { id: runId, synthetic } });
  if (!run) throw new NotFoundException('Forecast run not found');
  const forecasts = await tx.forecast.findMany({ where: { runId, recommendation: null,
    stock: { pharmacy: { isSynthetic: synthetic, isActive: true }, drug: { isActive: true } },
    OR: [{ shortage: { gt: 0 } }, { quantity: { lt: tx.forecast.fields.msl } }],
  }, include: { stock: { include: stockInclude }, risk: { select: { riskLevel: true, daysToStockout: true } } } });
  if (!forecasts.length) return { runId, created: 0, evaluated: 0 };
  const stocks = await tx.stockItem.findMany({ where: { drugId: { in: [...new Set(forecasts.map(f => f.stock.drugId))] },
    pharmacy: { isActive: true, isSynthetic: synthetic }, drug: { isActive: true },
  }, include: stockInclude });
  const incoming = await tx.recommendation.groupBy({ by: ['recipientStockId'], where: {
    recipientStock: { pharmacy: { isSynthetic: synthetic } }, status: { in: [...activeTransfers] },
  }, _sum: { quantity: true } });
  const inbound = new Map(incoming.map(r => [r.recipientStockId, r._sum.quantity ?? 0]));
  const pending = await tx.recommendation.groupBy({ by: ['donorStockId'], where: {
    forecast: { runId }, status: 'CREATED',
  }, _sum: { quantity: true }, _max: { priority: true } });
  const proposed = new Map(pending.map(row => [row.donorStockId, row._sum.quantity ?? 0]));
  const lastPriority = pending.reduce((rank, row) => Math.max(rank, row._max.priority ?? 0), 0);
  const distances = await tx.pharmacyDistance.findMany({ where: { isActual: true } });
  const pair = (from: number, to: number) => from + '/' + to;
  const cache = new Map(distances.map(d => [pair(d.fromPharmacyId, d.toPharmacyId), d]));
  const byDrug = new Map<number, typeof stocks>();
  const available = new Map<number, number>();
  for (const stock of stocks) {
    const group = byDrug.get(stock.drugId);
    if (group) group.push(stock);
    else byDrug.set(stock.drugId, [stock]);
    available.set(stock.stockId, Math.max(0, stock.quantity - stock.maxLevel - stock.reservedQuantity - (proposed.get(stock.stockId) ?? 0)));
  }
  const point = (stock: typeof stocks[number]) => ({
    latitude: Number(stock.pharmacy.latitude), longitude: Number(stock.pharmacy.longitude),
  });
  const limit = transferLimit();
  const recipients = forecasts.map(f => {
    const need = Math.max(0, Math.ceil(f.stock.msl - f.stock.quantity + Number(f.predictedDemand ?? 0))
      - (inbound.get(f.stockId) ?? 0));
    const daily = Number(f.predictedDemand ?? 0) / f.horizonDays;
    const belowMinimum = f.stock.quantity < f.stock.msl;
    const severity = belowMinimum ? 3 : f.risk?.riskLevel === 'HIGH' ? 2 : f.risk?.riskLevel === 'MEDIUM' ? 1 : 0;
    const days = belowMinimum ? 0 : f.risk?.daysToStockout != null ? Number(f.risk.daysToStockout)
      : daily > 0 ? (f.stock.quantity - f.stock.msl) / daily : Infinity;
    const candidates = (byDrug.get(f.stock.drugId) ?? []).filter(d => d.pharmacyId !== f.stock.pharmacyId).map(d => {
      const saved = cache.get(pair(d.pharmacyId, f.stock.pharmacyId));
      return { stockId: d.stockId, pharmacyId: d.pharmacyId, available: available.get(d.stockId) ?? 0,
        distance: haversine(point(d), point(f.stock)),
        roadDistance: saved?.source === Source.OSRM ? Number(saved.distanceKm) : null };
    });
    const quantity = Math.min(limit, need);
    return { f, need, quantity, severity, days, candidates };
  });
  const recommendations: Prisma.RecommendationCreateManyInput[] = [];
  const reasons = new Map<string, number[]>();
  const compare = (a: number, b: number) => a === b ? 0 : a < b ? -1 : 1;
  recipients.sort((a, b) => b.severity - a.severity || compare(a.days, b.days) || b.need - a.need || a.f.stockId - b.f.stockId);
  for (let start = 0; start < recipients.length;) {
    let end = start + 1;
    while (end < recipients.length && recipients[end].severity === recipients[start].severity && recipients[end].days === recipients[start].days &&
        recipients[end].need === recipients[start].need) end++;
    const group = recipients.slice(start, end);
    while (group.length) {
      const ranked = group.map(r => {
        const eligible = r.candidates.map(c => ({ ...c, available: available.get(c.stockId) ?? 0 }))
          .filter(c => c.available >= r.quantity);
        const useRoad = eligible.every(c => c.roadDistance !== null);
        const donor = r.quantity ? nearest(eligible.map(c => ({
          ...c, distance: useRoad ? c.roadDistance : c.distance, source: useRoad ? Source.OSRM : Source.HAVERSINE,
        })), r.quantity) : undefined;
        return { r, donor };
      }).sort((a,b) =>
        compare(a.donor?.distance ?? Infinity, b.donor?.distance ?? Infinity) || a.r.f.stockId - b.r.f.stockId);
      const { r, donor } = ranked[0];
      group.splice(group.indexOf(r), 1);
      const changed = r.f.stock.updatedAt > run.createdAt || r.f.stock.quantityAsOf > run.createdAt;
      const reason = changed ? 'STOCK_CHANGED_SINCE_FORECAST' : !r.need ? 'NEED_COVERED' : donor ? null :
        r.candidates.some(c => c.distance === null && (available.get(c.stockId) ?? 0) >= r.quantity)
          ? 'DISTANCE_UNAVAILABLE' : 'NO_DONOR_WITH_ENOUGH_SURPLUS';
      if (reason) {
        if (reason !== r.f.redistributionReason) {
          const ids = reasons.get(reason) ?? [];
          ids.push(r.f.forecastId);
          reasons.set(reason, ids);
        }
      } else if (donor) {
        available.set(donor.stockId, (available.get(donor.stockId) ?? 0) - r.quantity);
        recommendations.push({ forecastId: r.f.forecastId, donorStockId: donor.stockId, recipientStockId: r.f.stockId,
          quantity: r.quantity, priority: lastPriority + recommendations.length + 1, distanceKm: donor.distance,
          distanceSource: donor.source, uncoveredQuantity: r.need - r.quantity });
      }
    }
    start = end;
  }
  for (const [reason, ids] of reasons) {
    for (let start = 0; start < ids.length; start += 1000) {
      await tx.forecast.updateMany({ where: { forecastId: { in: ids.slice(start, start + 1000) } },
        data: { redistributionReason: reason } });
    }
  }
  const created = [];
  for (let start = 0; start < recommendations.length; start += 1000) {
    created.push(...await tx.recommendation.createManyAndReturn({ data: recommendations.slice(start, start + 1000),
      select: { recommendationId: true, recipientStockId: true, donorStockId: true, quantity: true },
    }));
    await tx.forecast.updateMany({ where: { runId, redistributionReason: { not: null }, recommendation: { isNot: null } },
      data: { redistributionReason: null } });
  }
  if (recommendations.length && !await tx.forecastRun.findFirst({
    where: { synthetic, OR: [{ asOf: { gt: run.asOf } }, { asOf: run.asOf, id: { gt: runId } }] }, select: { id: true },
  })) {
    const previous = await tx.forecastRun.findFirst({
      where: { synthetic, id: { not: runId } }, orderBy: [{ asOf: 'desc' }, { id: 'desc' }], select: { id: true },
    });
    const priorPlans = previous ? await tx.recommendation.findMany({
      where: { forecast: { runId: previous.id }, status: 'CREATED' }, select: { donorStockId: true, recipientStockId: true, quantity: true },
    }) : [];
    const key = ({ donorStockId, recipientStockId, quantity }: Pick<Prisma.RecommendationCreateManyInput,
      'donorStockId' | 'recipientStockId' | 'quantity'>) => `${donorStockId}/${recipientStockId}/${quantity}`;
    const priorKeys = new Map(priorPlans.map(row => [row.recipientStockId, key(row)]));
    const changed = created.filter(row => priorKeys.get(row.recipientStockId) !== key(row));
    const updated = changed.filter(row => priorKeys.has(row.recipientStockId)).length;
    if (changed.length) await notifyUsers(tx, { OR: [administrators, networkManagers] }, {
      title: 'Готові рекомендації перерозподілу',
      message: `Прогноз №${runId} · нових рекомендацій: ${changed.length - updated}, оновлено: ${updated}.`,
      recommendationIds: changed.map(row => row.recommendationId),
    });
  }
  return { runId, created: recommendations.length, evaluated: forecasts.length };
}
