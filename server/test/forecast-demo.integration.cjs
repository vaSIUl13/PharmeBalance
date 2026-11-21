const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PrismaClient } = require('@prisma/client');
const { calculateRun } = require('../dist/modules/forecasts/forecast-run');

test('dev demo publishes one complete snapshot and reuses it for concurrent workers', async t => {
  const url = new URL(process.env.DEMO_DATABASE_URL);
  assert(url.pathname.endsWith('_demo'));
  const db = new PrismaClient({datasourceUrl:url.href});
  t.after(()=>db.$disconnect());
  const batches = await db.importBatch.findMany({where:{syntheticKey:{startsWith:'synthetic:dev:'}}});
  assert.equal(batches.length,15,'Seed dev profile first');
  assert.equal(batches.reduce((n,b)=>n+b.recordsTotal,0),202500);
  const day = new Date(batches[0].fileName.split(':').at(-1));
  const runs = await Promise.all([calculateRun(db,day,true),calculateRun(db,day,true)]);
  assert.equal(runs[0].runId,runs[1].runId);
  assert(runs.some(r=>r.reused));
  const rows = await db.forecast.findMany({where:{runId:runs[0].runId},include:{stock:{include:{pharmacy:true}}}});
  assert.equal(rows.length,2250);
  assert(rows.every(r=>r.stock.pharmacy.isSynthetic && r.stock.pharmacy.code.startsWith('SYN-DEV-')));
  assert(rows.every(r=>r.abcClass && r.quality.observedDays===90 && r.quality.unknownAvailabilityDays===0));
  assert(rows.some(r=>r.quality.censoredDays>0));
  assert(rows.some(r=>r.projectedSurplus>0) && rows.some(r=>Number(r.shortage)>0));
});
