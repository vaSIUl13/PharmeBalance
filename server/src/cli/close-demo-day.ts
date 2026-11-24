import { PrismaClient } from '@prisma/client';
import { parseArgs } from 'node:util';
import { closeDemoDay, isDemoDatabase, latestDemoDay } from '../modules/demo-day/demo-close';
import { kyivDate, nextDay } from '../modules/demo-day/demo-report';
import { loadForecastPolicy } from '../modules/forecasts/forecast-policy';
import { validDate } from '../modules/imports/import-file';

async function main() {
  const { values } = parseArgs({ options: { day: { type: 'string' } } });
  const url = process.env.DATABASE_URL;
  if (!isDemoDatabase(url)) throw new Error('DATABASE_URL must refer to a demo database');
  if (values.day !== undefined && !validDate(values.day)) throw new Error('Use YYYY-MM-DD for --day');
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const latest = await latestDemoDay(db);
    if (!latest) throw new Error('Seed the demo database before closing a day');
    const result = await closeDemoDay(db, {
      through: kyivDate(new Date()).date, expected: values.day ?? nextDay(latest), policy: loadForecastPolicy(),
    });
    console.log(JSON.stringify(result));
  } finally {
    await db.$disconnect();
  }
}

void main().catch(error => {
  console.error('Demo day could not be closed:', error instanceof Error && error.constructor === Error ? error.message : 'operation failed');
  process.exitCode = 1;
});
