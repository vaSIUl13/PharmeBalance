import { PrismaClient } from '@prisma/client';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { validDate } from '../imports/import-file';
import { runForecastPipeline } from './forecast-pipeline';
import { dayMs } from './forecast-model';
import { loadForecastPolicy } from './forecast-policy';
import { closeDemoDay, isDemoDatabase, refreshDemoForecast } from '../demo-day/demo-close';
import { closedThrough, dayString } from '../demo-day/demo-report';

const maxDaysPerTick = 7;

async function main() {
  const { values } = parseArgs({ options: { demo: { type: 'boolean' }, watch: { type: 'boolean' }, 'as-of': { type: 'string' } } });
  const url = values.demo ? process.env.DEMO_DATABASE_URL : process.env.DATABASE_URL;
  if (!url) throw Error('Configure the forecast database');
  const synthetic = isDemoDatabase(url);
  if (values.demo && !synthetic) throw Error('--demo requires a database ending in _demo');
  if (values['as-of'] && (!synthetic || values.watch || !validDate(values['as-of']))) throw Error('Historical dates require a one-off demo run');
  const policy = loadForecastPolicy();
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    do {
      try {
        if (synthetic) {
          let closed = 0;
          if (values.watch && process.env.DEMO_AUTO_CLOSE === 'true') {
            const through = closedThrough(new Date());
            for (; closed < maxDaysPerTick; closed++) {
              const result = await closeDemoDay(db, { through, policy });
              if (result.status === 'no-active-stock') throw new Error('No active demo stock for daily closing');
              if (result.status !== 'closed') break;
              console.log(JSON.stringify({ synthetic: true, ...result }));
            }
          }
          if (!closed) console.log(JSON.stringify(await refreshDemoForecast(db, policy, values['as-of'])));
        } else {
          const day = dayString(new Date(Date.now() - dayMs));
          console.log(JSON.stringify({ day, synthetic, ...await runForecastPipeline(db, new Date(day), synthetic, policy) }));
        }
      } catch (error) {
        if (!values.watch) throw error;
        console.error('Forecast and recommendation pipeline failed',
          error instanceof Error && error.constructor === Error ? error.message : error instanceof Error ? error.name : 'unknown error');
      }
      if (values.watch) await delay(15 * 60_000);
    } while (values.watch);
  } finally { await db.$disconnect(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
