import type { Prisma, RiskLevel } from '@prisma/client';
import { administrators, networkManagers, pharmacyStaff } from '../notifications/business-notifications';
import { notifyUsers } from '../notifications/inbox.service';

const levels: Record<RiskLevel, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

function shortageChange(before: RiskLevel | null, after: RiskLevel | null) {
  if (!before && after) return 'added';
  if (before && !after) return 'resolved';
  if (before && after && before !== after) return levels[after] > levels[before] ? 'increased' : 'decreased';
  return null;
}

export async function notifyForecastChanges(tx: Prisma.TransactionClient, runId: number, previousId?: number) {
  const signal = { stockId: true, currentSurplus: true,
    risk: { select: { positionType: true, riskLevel: true } } } satisfies Prisma.ForecastSelect;
  const fields = { ...signal,
    stock: { select: { pharmacyId: true, pharmacy: { select: { name: true, code: true } },
      drug: { select: { sku: true } } } } } satisfies Prisma.ForecastSelect;
  const previous = previousId === undefined ? [] : await tx.forecast.findMany({
    where: { runId: previousId, risk: { isNot: null } }, select: signal,
  });
  const current = await tx.forecast.findMany({
    where: { runId, OR: [{ risk: { isNot: null } },
      ...(previous.length ? [{ stock: { forecastRows: { some: { runId: previousId, risk: { isNot: null } } } } }] : [])] },
    select: fields, orderBy: { stockId: 'asc' },
  });
  const oldByStock = new Map(previous.map(row => [row.stockId, row]));
  const empty = () => ({ added: 0, increased: 0, resolved: 0, decreased: 0, surplusAdded: 0, surplusResolved: 0 });
  const summaries = new Map<number, ReturnType<typeof empty> & { sample: string[]; pharmacy: string }>();
  for (const row of current) {
    const old = oldByStock.get(row.stockId);
    const change = shortageChange(old?.risk?.positionType === 'SHORTAGE' ? old.risk.riskLevel : null,
      row.risk?.positionType === 'SHORTAGE' ? row.risk.riskLevel : null);
    const hadSurplus = (old?.currentSurplus ?? 0) > 0;
    const hasSurplus = (row.currentSurplus ?? 0) > 0;
    if (!change && hadSurplus === hasSurplus) continue;
    const pharmacyId = row.stock.pharmacyId;
    const { name, code } = row.stock.pharmacy;
    const group = summaries.get(pharmacyId) ?? { ...empty(), sample: [], pharmacy: `${name} (${code})` };
    if (change) group[change]++;
    if (hadSurplus !== hasSurplus) group[hasSurplus ? 'surplusAdded' : 'surplusResolved']++;
    if (group.sample.length < 5) group.sample.push(row.stock.drug.sku);
    summaries.set(pharmacyId, group);
  }
  if (!summaries.size) return;
  const title = 'Змінилися ризики та надлишки';
  const totals = empty();
  const describe = ({ added, increased, resolved, decreased, surplusAdded, surplusResolved }: typeof totals) =>
    `Дефіцит. Нових: ${added}, посилилися: ${increased}, зникли: ${resolved}, послабилися: ${decreased}. Надлишки. Нових: ${surplusAdded}, зникли: ${surplusResolved}.`;
  for (const summary of summaries.values()) {
    totals.added += summary.added;
    totals.increased += summary.increased;
    totals.resolved += summary.resolved;
    totals.decreased += summary.decreased;
    totals.surplusAdded += summary.surplusAdded;
    totals.surplusResolved += summary.surplusResolved;
  }
  await notifyUsers(tx, { OR: [administrators, networkManagers] }, {
    title, message: `Прогноз №${runId} · аптек зі змінами: ${summaries.size}. ${describe(totals)}`,
  });
  const pharmacyId = { in: [...summaries.keys()] };
  const heads = await tx.userAccount.findMany({
    where: { isActive: true, ...pharmacyStaff(pharmacyId.in) },
    select: { userId: true, userPharmacyRows: { where: { unassignedAt: null, pharmacyId }, select: { pharmacyId: true } } },
  });
  const data = heads.flatMap(({ userId, userPharmacyRows }) => userPharmacyRows.map(row => {
    const summary = summaries.get(row.pharmacyId)!;
    return { userId, title, message: `${summary.pharmacy} · ${describe(summary)} SKU: ${summary.sample.join(', ')}.` };
  }));
  if (data.length) await tx.systemNotification.createMany({ data });
}
