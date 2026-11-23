const { createHash } = require('node:crypto');
const { parseArgs } = require('node:util');
const { PrismaClient, Prisma } = require('@prisma/client');

const PROFILES = {
  dev: { pharmacies: 15, drugs: 500, days: 90, assortment: 150 },
  performance: { pharmacies: 50, drugs: 5000, days: 120, assortment: 600 },
};
const DAY = 86_400_000;
const SCENARIOS = 12;
const families = [
  ['Paracetamol', 'tablets', '500 mg'], ['Ibuprofen', 'tablets', '200 mg'],
  ['Cetirizine', 'tablets', '10 mg'], ['Saline', 'nasal spray', '0.9%'],
  ['Omeprazole', 'capsules', '20 mg'], ['Amlodipine', 'tablets', '5 mg'],
];

function randomFor(seed, pharmacy, drug) {
  let state = createHash('sha256').update([seed, pharmacy, drug].join(':')).digest().readUInt32LE() || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2 ** 32;
  };
}

function poisson(mean, rng) {
  const threshold = Math.exp(-mean);
  let product = 1;
  let count = 0;
  do { product *= rng(); count++; } while (product > threshold);
  return count - 1;
}

function simulate(seed, pharmacy, drug, days, asOf) {
  const rng = randomFor(seed, pharmacy, drug);
  const focus = drug < SCENARIOS;
  const speed = focus || drug % 10 < 2 ? 'fast' : drug % 10 < 6 ? 'medium' : 'slow';
  const base = ({ fast: 5, medium: 1.75, slow: 0.28 })[speed] * (0.7 + rng() * 0.8);
  const leadTime = 2 + Math.floor(rng() * 5);
  const msl = Math.max(1, Math.ceil(base * (leadTime + 2)));
  const maxLevel = Math.max(msl + 2, Math.ceil(base * (leadTime + 12)));
  const initial = Math.round(maxLevel * (0.60 + rng() * 0.4));
  const unitPrice = (24 + (drug % 400) * 2.6 + Math.floor(rng() * 900) / 100).toFixed(2);
  let quantity = initial;
  let replenished = 0;
  let order;
  const sales = [];
  for (let day = 0; day < days; day++) {
    const saleDate = new Date(asOf.getTime() - (days - 1 - day) * DAY);
    const disrupted = focus && pharmacy === 0 && day >= days - 8;
    let receipt = 0;
    if (order && order.arrives <= day && !disrupted) {
      receipt = order.amount;
      order = undefined;
    }
    const seasonal = 1 + (drug % 4 === 0 ? 0.4 : 0.14) * Math.cos((saleDate.getUTCMonth() - 1) * Math.PI / 6);
    const weekend = [0, 6].includes(saleDate.getUTCDay()) ? 0.82 : 1;
    let demand = poisson(base * seasonal * weekend * (disrupted ? 1.7 : 1), rng);
    if (focus && pharmacy === 0 && day === days - 1) demand = Math.max(demand, quantity + receipt + 1);
    if (focus && (pharmacy === 1 || pharmacy === 2) && day === days - 1) {
      // A consolidated delivery followed by low local demand creates donors for the disrupted pharmacy.
      receipt += Math.max(0, maxLevel + Math.max(100, msl * (pharmacy === 1 ? 3 : 4)) + demand - quantity - receipt);
    }
    quantity += receipt;
    replenished += receipt;
    const sold = Math.min(quantity, demand);
    quantity -= sold;
    sales.push({ saleDate, quantity: sold, demand, unitPrice });
    if (!order && quantity <= msl && !disrupted && day < days - 1) {
      order = { arrives: day + leadTime, amount: maxLevel - quantity };
    }
  }
  return { initial, replenished, quantity, msl, maxLevel, speed, sales };
}

function assortment(profile, pharmacy) {
  const shared = Math.min(SCENARIOS, profile.assortment);
  const rotating = profile.assortment - shared;
  return Array.from({ length: profile.assortment }, (_, index) => index < shared
    ? index : shared + (pharmacy * rotating + index - shared) % (profile.drugs - shared));
}

function demoDrug(index, profile) {
  const [name, dosageForm, strength] = families[index % families.length];
  const number = String(index + 1).padStart(5, '0');
  return { sku: 'SYN-' + profile.toUpperCase() + '-' + number, name: '[SYNTHETIC] ' + name + ' ' + number,
    dosageForm, strength, unit: 'pack' };
}

function demoPharmacy(index, profile) {
  const group = Math.floor(index / 5);
  const offset = index % 5;
  return {
    code: 'SYN-' + profile.toUpperCase().slice(0, 4) + '-' + String(index + 1).padStart(3, '0'),
    name: '[SYNTHETIC] Demo pharmacy ' + (index + 1), city: 'Lviv demo area',
    address: 'Synthetic location ' + (index + 1),
    latitude: (49.84 + group * 0.02 + offset * 0.0017).toFixed(6),
    longitude: (24.03 + group * 0.019 + offset * 0.0013).toFixed(6), isSynthetic: true,
  };
}

async function persistPharmacy(db, data, pairs, ids, key, label, asOf) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS demo_seed_lock`);
    const previous = await tx.importBatch.findUnique({ where: { syntheticKey: key } });
    if (previous) {
      if (previous.fileName !== label) throw new Error('Profile already exists with a different seed or date. Use a fresh demo database.');
      return null;
    }
    if (await tx.pharmacy.findUnique({ where: { code: data.code } })) {
      throw new Error('Reserved demo pharmacy code already exists outside this seed');
    }
    const pharmacy = await tx.pharmacy.create({ data });
    const login = data.code.toLowerCase();
    const uploader = await tx.userAccount.create({ data: {
      email: login + '@example.invalid', login, firstName: 'Synthetic', lastName: 'Data uploader',
      passwordHash: 'disabled-synthetic-account', isActive: false, role: { connect: { code: 'head' } },
    } });
    await tx.userPharmacy.create({ data: { userId: uploader.userId, pharmacyId: pharmacy.pharmacyId } });
    const batch = await tx.importBatch.create({ data: {
      uploadedBy: uploader.userId, pharmacyId: pharmacy.pharmacyId, dataType: 'SALES',
      sourceFormat: 'JSON', fileName: label, recordsTotal: pairs.reduce((sum, pair) => sum + pair.sales.length, 0),
      isSynthetic: true, syntheticKey: key,
    } });
    const stocks = await tx.stockItem.createManyAndReturn({ data: pairs.map((pair) => ({
      pharmacyId: pharmacy.pharmacyId, drugId: ids[pair.drug],
      quantity: pair.quantity, msl: pair.msl, maxLevel: pair.maxLevel, updatedAt: asOf, quantityAsOf: asOf,
    })), select: { stockId: true, drugId: true } });
    const stockIds = new Map(stocks.map((row) => [row.drugId, row.stockId]));
    let buffer = [];
    let sales = 0;
    for (const pair of pairs) {
      const stockId = stockIds.get(ids[pair.drug]);
      for (const { saleDate, quantity, unitPrice, demand } of pair.sales) {
        buffer.push({ stockId, importId: batch.importId, saleDate, quantity, unitPrice, stockout: quantity < demand });
        if (buffer.length === 2500) {
          sales += (await tx.sale.createMany({ data: buffer })).count;
          buffer = [];
        }
      }
    }
    if (buffer.length) sales += (await tx.sale.createMany({ data: buffer })).count;
    return { stocks: stocks.length, sales };
  }, { timeout: 120_000 });
}

async function seedDemo(db, profileName, seed, asOf, apply) {
  const profile = PROFILES[profileName];
  if (!profile) throw new Error('Choose dev or performance');
  const total = profile.pharmacies;
  const stats = { profile: profileName, seed, asOf: asOf.toISOString().slice(0, 10), mode: apply ? 'apply' : 'dry-run',
    pharmacies: total, catalogSkus: profile.drugs, activeStockItems: 0, saleDays: 0,
    outOfStockDays: 0, unmetDemandDays: 0, belowMsl: 0, aboveMax: 0, redistributionScenarios: 0,
    newPharmacies: 0, newSkus: 0, newStockItems: 0, newSales: 0, skippedPharmacies: 0 };
  const runKey = 'synthetic:' + profileName;
  const label = '[SYNTHETIC] ' + profileName + ':' + seed + ':' + stats.asOf;
  const drugs = Array.from({ length: profile.drugs }, (_, index) => demoDrug(index, profileName));
  let ids;
  if (apply) {
    const previous = await db.importBatch.findFirst({ where: { syntheticKey: { startsWith: runKey + ':' }, fileName: { not: label } } });
    if (previous) throw new Error('Profile already exists with a different seed or date. Use a fresh demo database.');
    await db.$transaction(async (tx) => {
      const expected = new Map(drugs.map((drug) => [drug.sku, drug]));
      stats.newSkus = (await tx.drug.createMany({ data: drugs, skipDuplicates: true })).count;
      const existing = await tx.drug.findMany({ where: { sku: { in: [...expected.keys()] } } });
      if (existing.some(drug => drug.unit !== 'pack' || (drug.registrationId === null
        ? drug.name !== expected.get(drug.sku).name : !drug.registrationPackageKey))) {
        throw new Error('Reserved demo SKU conflicts with existing data');
      }
      const bySku = new Map(existing.map((row) => [row.sku, row.drugId]));
      ids = drugs.map((drug) => bySku.get(drug.sku));
    });
  }

  const recipients = [];
  for (let pharmacy = 0; pharmacy < total; pharmacy++) {
    const data = demoPharmacy(pharmacy, profileName);
    const pairs = assortment(profile, pharmacy).map((drug) => ({ drug, ...simulate(seed, pharmacy, drug, profile.days, asOf) }));
    for (const pair of pairs) {
      stats.activeStockItems++;
      stats.saleDays += pair.sales.length;
      stats.outOfStockDays += pair.sales.filter((sale) => sale.quantity === 0 && sale.demand > 0).length;
      stats.unmetDemandDays += pair.sales.filter((sale) => sale.quantity < sale.demand).length;
      if (pair.quantity < pair.msl) stats.belowMsl++;
      if (pair.quantity > pair.maxLevel) stats.aboveMax++;
      if (pair.drug < SCENARIOS) {
        if (pharmacy === 0) recipients[pair.drug] = pair.msl - pair.quantity;
        if (pharmacy === 1 && recipients[pair.drug] > 0 && pair.quantity - pair.maxLevel >= recipients[pair.drug]) {
          stats.redistributionScenarios++;
        }
      }
    }
    if (!apply) continue;
    const created = await persistPharmacy(db, data, pairs, ids, runKey + ':' + data.code, label, asOf);
    if (!created) stats.skippedPharmacies++;
    else {
      stats.newPharmacies++;
      stats.newStockItems += created.stocks;
      stats.newSales += created.sales;
    }
  }
  return stats;
}

async function main() {
  const { values } = parseArgs({ options: {
    profile: { type: 'string', default: 'dev' }, seed: { type: 'string', default: '42' },
    'as-of': { type: 'string', default: '2026-11-20' }, 'dry-run': { type: 'boolean' }, apply: { type: 'boolean' },
  } });
  if (values.apply && values['dry-run']) throw new Error('Choose either --dry-run or --apply');
  const seed = Number(values.seed);
  const asOf = new Date(values['as-of'] + 'T00:00:00Z');
  if (!Number.isSafeInteger(seed) || !/^\d{4}-\d{2}-\d{2}$/.test(values['as-of']) ||
      !Number.isFinite(asOf.getTime()) || asOf.toISOString().slice(0, 10) !== values['as-of']) {
    throw new Error('Provide a valid integer seed and YYYY-MM-DD date');
  }
  if (values.apply && (!process.env.DEMO_DATABASE_URL || !/_demo$/.test(new URL(process.env.DEMO_DATABASE_URL).pathname))) {
    throw new Error('Set DEMO_DATABASE_URL to a migrated demo database with a name ending in _demo');
  }
  const db = values.apply ? new PrismaClient({ datasourceUrl: process.env.DEMO_DATABASE_URL }) : null;
  try { console.log(JSON.stringify(await seedDemo(db, values.profile, seed, asOf, values.apply), null, 2)); }
  finally { await db?.$disconnect(); }
}

if (require.main === module) main().catch((error) => {
  console.error(error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[DATABASE_URL]'));
  process.exitCode = 1;
});
module.exports = { PROFILES, simulate, assortment, seedDemo, persistPharmacy };
