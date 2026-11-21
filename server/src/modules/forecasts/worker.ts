import { PrismaClient } from '@prisma/client';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { validDate } from '../imports/import-file';
import { calculateRun } from './forecast-run';
import { basePolicy, dayMs } from './forecast-model';

async function main() {
  const { values } = parseArgs({ options: { demo: { type: 'boolean' }, watch: { type: 'boolean' }, 'as-of': { type: 'string' } } });
  const synthetic = !!values.demo;
  const url = synthetic ? process.env.DEMO_DATABASE_URL : process.env.DATABASE_URL;
  if (!url || new URL(url).pathname.endsWith('_demo') !== synthetic) throw Error('Check forecast database and --demo');
  if (values['as-of'] && (!synthetic || values.watch || !validDate(values['as-of']))) throw Error('Historical dates require a one-off demo run');
  const policy = { ...basePolicy };
  for (const [key, name] of [['abcA', 'FORECAST_ABC_A'], ['abcB', 'FORECAST_ABC_B'],
    ['xyzX', 'FORECAST_XYZ_X'], ['xyzY', 'FORECAST_XYZ_Y']] as const) {
    const raw = process.env[name];
    if (raw === undefined && synthetic) continue;
    if (!raw?.trim() || !Number.isFinite(Number(raw)) || Number(raw) <= 0) throw Error('Set a positive ' + name);
    policy[key] = Number(raw);
  }
  if (policy.abcA >= policy.abcB || policy.abcB >= 1 || policy.xyzX >= policy.xyzY) throw Error('Invalid classification boundaries');
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    do {
      const latestDemoSale = synthetic ? await db.sale.findFirst({
        where: { import: { is: { isSynthetic: true } } },
        orderBy: { saleDate: 'desc' },
        select: { saleDate: true },
      }) : null;
      const latestDemoDay = latestDemoSale?.saleDate.toISOString().slice(0, 10);
      if (synthetic && (!latestDemoDay || values['as-of'] && values['as-of'] !== latestDemoDay)) {
        throw Error('Use the final sales day of the seeded demo inventory snapshot');
      }
      const day = latestDemoDay ?? new Date(Date.now() - dayMs).toISOString().slice(0, 10);
      if (day > new Date().toISOString().slice(0, 10)) throw Error('Future forecast cutoff');
      try {
        console.log(JSON.stringify({ day, synthetic, ...await calculateRun(db, new Date(day), synthetic, policy) }));
      } catch (error) {
        if (!values.watch) throw error;
        console.error('Forecast run failed', error instanceof Error ? error.name : 'unknown error');
      }
      if (values.watch) await delay(15 * 60_000);
    } while (values.watch);
  } finally { await db.$disconnect(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
