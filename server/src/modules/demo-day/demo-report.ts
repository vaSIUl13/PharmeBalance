import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const dayMs = 86_400_000;
const intMax = 2_147_483_647;
const kyiv = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
});

export function kyivDate(now: Date) {
  const parts = Object.fromEntries(kyiv.formatToParts(now).map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export const dayString = (date: Date) => date.toISOString().slice(0, 10);
export const nextDay = (day: string) => dayString(new Date(+new Date(day) + dayMs));

export function closedThrough(now: Date) {
  const { date, hour } = kyivDate(now);
  return hour >= 18 ? date : dayString(new Date(+new Date(date) - dayMs));
}

export type SimulatedStock = {
  stockId: number; pharmacyId: number; sku: string; quantity: number; reserved: number; msl: number;
  maxLevel: number; average: number | null; unitPrice: string | null;
};

export function simulatePosition(stock: SimulatedStock, day: string) {
  const date = new Date(day);
  const [salt, daily] = [stock.sku + '/' + stock.pharmacyId, stock.sku + '/' + stock.pharmacyId + '/' + day]
    .map(key => createHash('sha256').update(key).digest());
  const rand = (index: number) => daily[index] / 256;
  const base = Math.max(0, Math.min(250, stock.average ?? stock.msl / 7));
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
  const season = 1 + (salt[0] % 4 === 0 ? 0.25 : 0.08) * Math.cos((date.getUTCMonth() - 1) * Math.PI / 6);
  const demand = Math.round(base * (0.45 + rand(0) * 1.1) * season * (weekend ? 0.83 : 1) * (rand(1) < 0.04 ? 2.2 : 1));
  const available = stock.quantity - stock.reserved;
  const cadence = 2 + salt[1] % 4;
  const supplierDay = (Math.floor(+date / dayMs) + salt[2]) % cadence === 0;
  const target = Math.max(stock.maxLevel, stock.msl);
  const received = available <= stock.msl && supplierDay && rand(2) >= 0.12
    ? Math.min(intMax - stock.quantity, Math.max(0, target - stock.quantity)) : 0;
  const sold = Math.min(demand, available + received);
  const returned = sold > 0 && rand(3) < 0.08 ? Math.max(1, Math.floor(sold * 0.05)) : 0;
  return {
    stockId: stock.stockId, pharmacyId: stock.pharmacyId, sku: stock.sku, opening: stock.quantity, reserved: stock.reserved,
    received, sold, returned, closing: stock.quantity + received - sold + returned, stockout: sold < demand,
    unitPrice: stock.unitPrice,
  };
}

export type DailyRow = ReturnType<typeof simulatePosition>;
export type DailyReport = { kind: 'pharmabalance-demo-day-v1'; synthetic: true; day: string; rows: DailyRow[] };

export async function archiveReport(database: string, report: DailyReport, directory = process.env.DEMO_REPORT_DIR) {
  if (!report.rows.length || new Set(report.rows.map(row => row.stockId)).size !== report.rows.length ||
      report.rows.some(row => row.opening < row.reserved || row.sold < 0 || row.received < 0 || row.returned < 0 ||
        row.sold + row.reserved > row.opening + row.received || row.returned > row.sold ||
        row.closing < row.reserved || row.closing !== row.opening + row.received - row.sold + row.returned)) {
    throw new Error('Invalid daily demo report');
  }
  const json = JSON.stringify(report, null, 2) + '\n';
  const checksum = createHash('sha256').update(json).digest('hex');
  const databaseKey = createHash('sha256').update(database).digest('hex').slice(0, 12);
  const folder = resolve(directory || '../.local-cache/demo-reports', databaseKey);
  const fileName = `demo-${report.day}-${checksum.slice(0, 12)}.json`;
  const file = join(folder, fileName);
  await mkdir(folder, { recursive: true });
  const temporary = join(folder, randomUUID() + '.tmp');
  try {
    await writeFile(temporary, json, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, file);
    if (await readFile(file, 'utf8') !== json) throw new Error('Daily demo report is incomplete or corrupt');
  } finally {
    await rm(temporary, { force: true });
  }
  return { checksum, fileName };
}
