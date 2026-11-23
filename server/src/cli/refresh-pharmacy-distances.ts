import { PrismaClient, Source } from '@prisma/client';

const batchSize = 50;

async function main() {
  const explicitDemo = process.argv.includes('--demo');
  const database = explicitDemo ? process.env.DEMO_DATABASE_URL : process.env.DATABASE_URL;
  const base = new URL(process.env.OSRM_BASE_URL ?? '');
  if (!database) throw Error('Configure the routing database');
  const demo = new URL(database).pathname.endsWith('_demo');
  if (explicitDemo && !demo) throw Error('--demo requires a database ending in _demo');
  if (!['http:', 'https:'].includes(base.protocol)) throw Error('Set an HTTP(S) OSRM_BASE_URL');
  const db = new PrismaClient({ datasourceUrl: database });
  try {
    const locations = await db.pharmacy.findMany({ where: { isActive: true, isSynthetic: demo }, orderBy: { pharmacyId: 'asc' },
      select: { pharmacyId: true, longitude: true, latitude: true } });
    let updated = 0;
    let unroutable = 0;
    for (let start = 0; start < locations.length; start += batchSize) {
      const sources = locations.slice(start, start + batchSize);
      for (let offset = 0; offset < locations.length; offset += batchSize) {
        const destinations = locations.slice(offset, offset + batchSize);
        const points = start === offset ? sources : [...sources, ...destinations];
        const coordinates = points.map(p => p.longitude + ',' + p.latitude).join(';');
        const url = new URL('table/v1/driving/' + coordinates, base.href.replace(/\/?$/, '/'));
        url.searchParams.set('sources', sources.map((_, index) => index).join(';'));
        url.searchParams.set('destinations', destinations.map((_, index) => index + (start === offset ? 0 : sources.length)).join(';'));
        url.searchParams.set('annotations', 'distance');
        const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw Error('OSRM HTTP ' + response.status);
        const result: { code?: unknown; distances?: unknown[][] } = await response.json();
        const distances = result.distances;
        if (result.code !== 'Ok' || !Array.isArray(distances) || distances.length !== sources.length ||
            !distances.every(row => Array.isArray(row) && row.length === destinations.length &&
              row.every(value => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0))) {
          throw Error('Invalid OSRM distance matrix');
        }
        await db.$transaction(async tx => {
          for (const [sourceIndex, from] of sources.entries()) {
            for (const [targetIndex, to] of destinations.entries()) {
              if (from.pharmacyId === to.pharmacyId) continue;
              const pair = { fromPharmacyId: from.pharmacyId, toPharmacyId: to.pharmacyId };
              const meters = distances[sourceIndex][targetIndex];
              if (typeof meters !== 'number') {
                await tx.pharmacyDistance.updateMany({ where: pair, data: { isActual: false } });
                unroutable++;
                continue;
              }
              const distance = { distanceKm: (meters / 1000).toFixed(2), source: Source.OSRM, calculatedAt: new Date(), isActual: true };
              await tx.pharmacyDistance.upsert({ where: { fromPharmacyId_toPharmacyId: pair }, create: { ...pair, ...distance }, update: distance });
              updated++;
            }
          }
        }, { timeout: 30_000 });
      }
    }
    console.log(JSON.stringify({ pharmacies: locations.length, updated, unroutable }));
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  console.error('Distance refresh failed:', error instanceof Error ? error.message.replace(/https?:\/\/\S+|postgres(?:ql)?:\/\/\S+/g, '[URL]') : 'Unknown error');
  process.exitCode = 1;
});
