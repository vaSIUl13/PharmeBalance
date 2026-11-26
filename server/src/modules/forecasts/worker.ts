import { PrismaClient } from '@prisma/client';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { validDate } from '../imports/import-file';
import { runForecastPipeline } from './forecast-pipeline';
import { dayMs } from './forecast-model';
import { loadForecastPolicy } from './forecast-policy';
import { closeDemoDay, isDemoDatabase, refreshDemoForecast } from '../demo-day/demo-close';
import { closedThrough, dayString } from '../demo-day/demo-report';
import { ForecastMetrics, listenForecastMetrics } from './forecast-metrics';
import { forecastSlot, untilNextForecastSlot } from './forecast-schedule';

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
  const telemetry = new ForecastMetrics();
  try {
    const stopMetrics = values.watch ? await listenForecastMetrics(telemetry, process.env.FORECAST_METRICS_PORT) : undefined;
    try {
      await run();
    } finally {
      await stopMetrics?.();
    }
  } finally {
    await db.$disconnect();
  }

  async function run() {
    do {
      const started = performance.now();
      try {
        const day = await runCycle();
        telemetry.succeeded((performance.now() - started) / 1000, day);
      } catch (error) {
        telemetry.failed((performance.now() - started) / 1000);
        if (!values.watch) throw error;
        console.error('Forecast and recommendation pipeline failed',
          error instanceof Error && error.constructor === Error ? error.message : error instanceof Error ? error.name : 'unknown error');
      }
      if (values.watch) await delay(untilNextForecastSlot(new Date()));
    } while (values.watch);
  }

  async function runCycle() {
    if (!synthetic) {
      const day = dayString(new Date(Date.now() - dayMs));
      console.log(JSON.stringify({ day, synthetic, ...await runForecastPipeline(db, new Date(day), synthetic, policy) }));
      return day;
    }

    const now = new Date();
    const slot = values.watch && (process.env.DEMO_INTRADAY_RISKS ?? process.env.DEMO_AUTO_CLOSE) === 'true'
      ? forecastSlot(now) : undefined;
    let day: string | undefined;
    if (values.watch && process.env.DEMO_AUTO_CLOSE === 'true') {
      const through = closedThrough(now);
      for (let closed = 0; closed < maxDaysPerTick; closed++) {
        const result = await closeDemoDay(db, { through, policy });
        if (result.status === 'no-active-stock') throw new Error('No active demo stock for daily closing');
        if (result.status !== 'closed') break;
        day = result.day;
        console.log(JSON.stringify({ synthetic: true, ...result }));
      }
    }
    if (day && !slot) return day;

    const forecast = await refreshDemoForecast(db, policy, values['as-of'], slot);
    console.log(JSON.stringify(forecast));
    return forecast.day;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
