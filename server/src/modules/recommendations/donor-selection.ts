type Point = { latitude: number; longitude: number };
export type Candidate = { stockId: number; pharmacyId: number; available: number; distance: number | null };

export function haversine(a: Point, b: Point) {
  const valid = (p: Point) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
  if (!valid(a) || !valid(b)) return null;
  const radians = Math.PI / 180;
  const lat = Math.sin((b.latitude - a.latitude) * radians / 2);
  const lon = Math.sin((b.longitude - a.longitude) * radians / 2);
  const square = lat ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * lon ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, square)));
}

export function nearest<T extends Candidate>(candidates: T[], quantity: number) {
  return candidates.filter(c => c.available >= quantity && c.distance !== null)
    .sort((a, b) => a.distance! - b.distance! || a.pharmacyId - b.pharmacyId || a.stockId - b.stockId)[0];
}

export function transferLimit() {
  const limit = Number(process.env.TRANSFER_MAX_QUANTITY ?? '100');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2147483647) throw Error('Invalid TRANSFER_MAX_QUANTITY');
  return limit;
}
