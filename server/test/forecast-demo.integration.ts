import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { calculateRun } from '../src/modules/forecasts/forecast-run';

test('dev demo publishes one complete snapshot and reuses it for concurrent workers', async (t) => {
  const url = process.env.DEMO_DATABASE_URL;
  assert(url && new URL(url).pathname.endsWith('_demo'), 'Set DEMO_DATABASE_URL to a seeded _demo database');
  const db = new PrismaClient({ datasourceUrl: url });
  t.after(() => db.$disconnect());

  const batches = await db.importBatch.findMany({ where: { syntheticKey: { startsWith: 'synthetic:dev:' } } });
  assert.equal(batches.length, 15, 'Seed dev profile first');
  assert.equal(batches.reduce((count, batch) => count + batch.recordsTotal, 0), 202500);
  const date = batches[0].fileName.split(':').at(-1);
  assert.ok(date, 'Expected a date in the synthetic batch filename');
  const day = new Date(date);
  const runs = await Promise.all([calculateRun(db, day, true), calculateRun(db, day, true)]);
  assert.equal(runs[0].runId, runs[1].runId);
  assert(runs.some((run) => run.reused));

  const rows = await db.forecast.findMany({
    where: { runId: runs[0].runId },
    include: { stock: { include: { pharmacy: true } } },
  });
  assert.equal(rows.length, 2250);
  assert(rows.every(({ stock }) => stock.pharmacy.isSynthetic && stock.pharmacy.code.startsWith('SYN-DEV-')));
  const diagnostics = rows.map(({ quality, abcClass }) => {
    assert(abcClass);
    assert(quality && typeof quality === 'object' && !Array.isArray(quality));
    assert.equal(quality.observedDays, 90);
    assert.equal(quality.unknownAvailabilityDays, 0);
    return quality;
  });
  assert(diagnostics.some(({ censoredDays }) => typeof censoredDays === 'number' && censoredDays > 0));
  assert(rows.some(({ projectedSurplus }) => projectedSurplus !== null && projectedSurplus > 0));
  assert(rows.some(({ shortage }) => Number(shortage) > 0));
});
