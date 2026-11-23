import { resolve } from 'node:path';

const catalog = resolve(process.cwd(), 'scripts', 'catalog');

type PharmacyRecord = {
  externalId: string;
  name: string | null;
  address: string | null;
  latitude: string | null;
  coordinateQuality: string | null;
};

export const { parseDrlz, parseOverpass, parsePharmacyCsv, packageKey, drlzUrl, createHttpClient }: {
  parseDrlz(summary: unknown, version: unknown): {
    number: string;
    manufacturers: { role: string }[];
    packages: { key: string }[];
  };
  parseOverpass(payload: unknown): PharmacyRecord[];
  parsePharmacyCsv(input: string, columns: Record<string, string>, delimiter?: string): PharmacyRecord[];
  packageKey(fields: Record<string, string>): string;
  drlzUrl(url: string, endpoint: string): string;
  createHttpClient(settings: { interval: number; timeout: number }): (url: string) => Promise<{ body: unknown }>;
} = require(resolve(catalog, 'adapters.cjs'));

export const { makeSource }: {
  makeSource(source: 'drlz', options: { mode: 'incremental' }): Promise<{
    start(since: string): { url: string };
  }>;
} = require(resolve(catalog, 'sync.cjs'));

type Scenario = {
  initial: number;
  replenished: number;
  quantity: number;
  msl: number;
  maxLevel: number;
  sales: { saleDate: Date; quantity: number; demand: number }[];
};

export const { PROFILES, simulate }: {
  PROFILES: Record<'dev' | 'performance', { pharmacies: number; drugs: number; days: number; assortment: number }>;
  simulate(seed: number, pharmacy: number, drug: number, days: number, asOf: Date): Scenario;
} = require(resolve(catalog, 'demo.cjs'));
