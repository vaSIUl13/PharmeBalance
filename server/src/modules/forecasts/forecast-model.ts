export const dayMs = 86_400_000;
export const modelVersion = 'aligned-14d-v1';
export const basePolicy = {
  historyDays: 90, horizonDays: 14, minObserved: 63, minWindows: 3,
  abcA: 0.80, abcB: 0.95, xyzX: 0.10, xyzY: 0.25, mediumRisk: 0.30, highRisk: 0.70,
};
export type Policy = typeof basePolicy;
export type DailySale = { saleDate: Date; quantity: number; returnedQuantity: number;
  cents: bigint | null; stockout: boolean | null };
export type Position = { stockId: number; quantity: number; msl: number; maxLevel: number };

export function calculate(stock: Position, sales: DailySale[], asOf: Date, p: Policy) {
  const days = Array<DailySale | undefined>(p.historyDays);
  for (const sale of sales) {
    const index = p.historyDays - 1 - (asOf.getTime() - sale.saleDate.getTime()) / dayMs;
    if (Number.isInteger(index) && index >= 0 && index < days.length) days[index] = sale;
  }
  const recorded = days.filter((d): d is DailySale => d !== undefined);
  const usable = recorded.filter(d => !d.stockout);
  const mean = usable.length ? usable.reduce((sum, d) => sum + d.quantity, 0) / usable.length : 0;
  const variance = usable.reduce((sum, d) => sum + (d.quantity - mean) ** 2, 0) / (usable.length || 1);
  const cv = mean > 0 ? Math.sqrt(variance) / mean : null;
  const windows: number[] = [];
  for (let end = days.length; end >= p.horizonDays; end -= 7) {
    const valid = days.slice(end - p.horizonDays, end).filter((d): d is DailySale => !!d && !d.stockout);
    if (valid.length === p.horizonDays) windows.push(valid.reduce((sum, d) => sum + d.quantity, 0));
  }
  const historyReady = !!days[0] && usable.length >= p.minObserved;
  const reason = !historyReady ? 'INSUFFICIENT_HISTORY' : windows.length < p.minWindows ? 'INSUFFICIENT_WINDOWS' : null;
  const predictedDemand = reason ? null : windows.reduce((sum, q) => sum + q, 0) / windows.length;
  const shortageProbability = reason ? null : windows.filter(q => stock.quantity - q < stock.msl).length / windows.length;
  const projected = predictedDemand === null ? null : stock.quantity - predictedDemand;
  const priced = recorded.every(d => d.quantity === d.returnedQuantity || d.cents !== null);
  const turnover = priced && recorded.length === days.length ? recorded.reduce(
    (sum, d) => sum + BigInt(d.quantity - d.returnedQuantity) * (d.cents ?? 0n), 0n) : null;
  const xyzClass: 'X' | 'Y' | 'Z' | null = !historyReady || cv === null ? null : cv <= p.xyzX ? 'X' : cv <= p.xyzY ? 'Y' : 'Z';
  return { stockId: stock.stockId, quantity: stock.quantity, msl: stock.msl, maxLevel: stock.maxLevel,
    turnover, abcClass: null as 'A' | 'B' | 'C' | null, xyzClass, predictedDemand, shortageProbability,
    shortage: projected === null ? null : Math.max(0, Math.ceil(stock.msl - projected)),
    currentSurplus: Math.max(0, stock.quantity - stock.maxLevel),
    projectedSurplus: projected === null ? null : Math.max(0, Math.floor(projected - stock.maxLevel)),
    quality: { reason, cv, windows: windows.length, observedDays: recorded.length, censoredDays: recorded.length - usable.length,
      unknownAvailabilityDays: recorded.filter(d => d.stockout === null).length, missingPrices: !priced,
      turnoverCents: turnover?.toString() ?? null, abcReason: null as string | null },
  };
}

export function classifyPharmacy(rows: ReturnType<typeof calculate>[], p: Policy) {
  const reason = rows.some(r => r.turnover === null) ? 'INCOMPLETE_TURNOVER' :
    rows.some(r => r.turnover! < 0n) ? 'NEGATIVE_NET_TURNOVER' : null;
  const total = rows.reduce((sum, row) => sum + (row.turnover ?? 0n), 0n);
  if (reason || !total) {
    for (const r of rows) r.quality.abcReason = reason ?? 'ZERO_TURNOVER';
    return;
  }
  const sorted = [...rows].sort((a,b) => a.turnover === b.turnover ? a.stockId - b.stockId : a.turnover! > b.turnover! ? -1 : 1);
  let cumulative = 0n;
  for (const r of sorted) {
    const prior = cumulative * 10000n;
    r.abcClass = r.turnover === 0n ? 'C' : prior < total * BigInt(Math.round(p.abcA * 10000)) ? 'A' :
      prior < total * BigInt(Math.round(p.abcB * 10000)) ? 'B' : 'C';
    cumulative += r.turnover!;
  }
}
