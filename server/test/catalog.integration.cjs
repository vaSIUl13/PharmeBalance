const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const { PrismaClient } = require('@prisma/client');
const { synchronize } = require('../scripts/catalog/sync.cjs');
const { parseDrlz } = require('../scripts/catalog/adapters.cjs');
const { linkSku } = require('../scripts/catalog/link-sku.cjs');
const { simulate, persistPharmacy } = require('../scripts/catalog/demo.cjs');
const { PharmaciesService } = require('../dist/modules/pharmacies/pharmacies.service.js');

test('catalog and demo persistence against isolated PostgreSQL', async (t) => {
  const url = process.env.CATALOG_TEST_DATABASE_URL;
  assert(url && /_test$/.test(new URL(url).pathname), 'Set CATALOG_TEST_DATABASE_URL to a migrated _test database');
  const db = new PrismaClient({ datasourceUrl: url });
  const id = randomBytes(5).toString('hex');
  const source = 'T' + id;
  const number = 'XT/' + id.toUpperCase() + '/01';
  const email = id + '@example.invalid';
  let pharmacyId;
  let adminId;
  let demoUploaderId;
  let demoPharmacyId;
  let demoDrugId;

  t.after(async () => {
    try {
      await db.externalPharmacy.deleteMany({ where: { source } });
      await db.catalogSyncRun.deleteMany({ where: { source: { in: [source, ('D' + id)] } } });
      await db.drug.deleteMany({ where: { registration: { number } } });
      await db.drugRegistration.deleteMany({ where: { number } });
      if (demoPharmacyId) {
        await db.sale.deleteMany({ where: { stock: { pharmacyId: demoPharmacyId } } });
        await db.stockItem.deleteMany({ where: { pharmacyId: demoPharmacyId } });
        await db.importBatch.deleteMany({ where: { pharmacyId: demoPharmacyId } });
        await db.userPharmacy.deleteMany({ where: { pharmacyId: demoPharmacyId } });
        await db.pharmacy.delete({ where: { pharmacyId: demoPharmacyId } });
      }
      if (demoUploaderId) await db.userAccount.delete({ where: { userId: demoUploaderId } });
      if (demoDrugId) await db.drug.delete({ where: { drugId: demoDrugId } });
      if (adminId) {
        await db.auditLog.deleteMany({ where: { userId: adminId } });
        await db.userAccount.delete({ where: { userId: adminId } });
      }
      if (pharmacyId) await db.pharmacy.delete({ where: { pharmacyId } });
    } finally { await db.$disconnect(); }
  });

  const pharmacyRow = {
    externalId: 'way:111', name: 'Source pharmacy', city: 'Lviv', address: 'Test 5',
    latitude: '49.840000', longitude: '24.030000', coordinateQuality: 'CENTER', sourceModifiedAt: null,
  };
  const secondRow = { ...pharmacyRow, externalId: 'node:112' };
  const rows = [pharmacyRow, secondRow, { ...secondRow }];
  function adapter(fail = false) {
    return {
      source, scope: 'fixture', isDrlz: false, start: () => ({ offset: 0 }),
      page: async () => ({ records: rows, removed: [], done: true, etag: '"stable"' }),
      materialize: async (row) => {
        if (fail && row.externalId === secondRow.externalId) throw new Error('simulated source failure');
        return row;
      },
    };
  }

  await t.test('dry-run, failed checkpoint, resume and idempotence', async () => {
    assert.equal((await synchronize(db, adapter(), { apply: false })).created, 2);
    assert.equal(await db.externalPharmacy.count({ where: { source } }), 0);
    assert.equal(await db.catalogSyncRun.count({ where: { source } }), 0);
    await assert.rejects(synchronize(db, adapter(true), { apply: true }), /simulated source failure/);
    const failed = await db.catalogSyncRun.findFirstOrThrow({ where: { source, status: 'FAILED' } });
    assert.equal(failed.checkpoint.offset, 1);
    assert.equal(failed.counters.created, 1);
    const resumed = await synchronize(db, adapter(), { apply: true, resume: true });
    assert.equal(resumed.created, 1);
    assert.equal(resumed.duplicates, 1);
    assert.equal(resumed.status, 'SUCCEEDED');
    const repeat = await synchronize(db, adapter(), { apply: true });
    assert.equal(repeat.unchanged, 2);
    assert.equal(repeat.duplicates, 1);
    assert.equal(repeat.created, 0);
  });

  await t.test('a managed pharmacy optionally links a source without becoming part of the feed', async () => {
    const admin = await db.userAccount.create({ data: {
      email, login: id, firstName: 'Test', lastName: 'Catalog', passwordHash: 'disabled-test',
      role: { connect: { code: 'admin' } }, isActive: false,
    } });
    adminId = admin.userId;
    const external = await db.externalPharmacy.findUniqueOrThrow({
      where: { source_externalId: { source, externalId: pharmacyRow.externalId } },
    });
    assert.equal(external.pharmacyId, null);
    const service = new PharmaciesService(db);
    const data = { code: id.toUpperCase(), name: 'Managed area', city: 'Lviv',
      address: 'Reviewed 44', latitude: '49.84', longitude: '24.03' };
    const pharmacy = await service.create(data, [external.id], admin.userId);
    pharmacyId = pharmacy.pharmacyId;
    assert.equal(pharmacy.isActive, false);
    await assert.rejects(service.create({ ...data, code: id + 'B' }, [external.id], admin.userId), /already linked/);
    assert.equal(await db.pharmacy.count({ where: { code: id + 'B' } }), 0);
    rows[0] = { ...pharmacyRow, address: 'Changed external address' };
    assert.equal((await synchronize(db, adapter(), { apply: true })).updated, 1);
    assert.equal((await db.pharmacy.findUniqueOrThrow({ where: { pharmacyId } })).address, data.address);
    assert.equal((await db.externalPharmacy.findUniqueOrThrow({ where: { id: external.id } })).pharmacyId, pharmacyId);
  });

  await t.test('registration is stable, pack selection is explicit, and duplicate SKU mapping is rejected', async () => {
    const registration = parseDrlz({
      id: id + '-medicine', attributes: { number, title: 'Test Drug', is_current: true },
    }, {
      id: 'v-' + id, attributes: { packages: [
        { dose: '250 mg', form: 'capsules', primary: 'blister', quantity: '10' },
        { dose: '250 mg', form: 'capsules', primary: 'blister', quantity: '20' },
      ] },
    });
    const medicine = {
      source: 'D' + id, scope: 'fixture', isDrlz: true, start: () => ({ offset: 0, baselineSince: new Date().toISOString() }),
      page: async () => ({ records: [registration], removed: [], done: true, next: null }),
      materialize: async (row) => row,
    };
    assert.equal((await synchronize(db, medicine, { apply: true })).created, 1);
    assert.equal((await synchronize(db, medicine, { apply: true })).unchanged, 1);
    assert.equal(await db.drug.count({ where: { registration: { number } } }), 0);
    const options = { registration: number, package: registration.packages[0].key, sku: 'CAT-' + id, unit: 'pack' };
    assert.equal((await linkSku(db, options)).status, 'planned');
    assert.equal((await linkSku(db, { ...options, apply: true })).status, 'created');
    assert.equal((await linkSku(db, { ...options, apply: true })).status, 'unchanged');
    await assert.rejects(linkSku(db, { ...options, sku: 'OTHER-' + id, apply: true }), /already has a SKU/);
    assert.equal((await linkSku(db, { ...options, package: registration.packages[1].key, sku: 'OTHER-' + id, apply: true })).status, 'created');
  });

  await t.test('small synthetic slice uses existing stock, sale and import tables', async () => {
    const drug = await db.drug.create({ data: {
      sku: 'SYN-' + id, name: '[SYNTHETIC] Test', dosageForm: 'capsules', unit: 'pack',
    } });
    demoDrugId = drug.drugId;
    const code = 'SYN-' + id.toUpperCase();
    const data = { code, name: '[SYNTHETIC] Test pharmacy', city: 'Test',
      address: 'Test 1', latitude: '49.84', longitude: '24.03', isSynthetic: true };
    const asOf = new Date('2026-11-20T00:00:00Z');
    const result = simulate(42, 0, 0, 12, asOf);
    const key = 'synthetic:test:' + id;
    const args = [db, data, [{ drug: 0, ...result }], [drug.drugId], key, '[SYNTHETIC] test', asOf];
    assert.deepEqual(await persistPharmacy(...args), { stocks: 1, sales: 12 });
    const batch = await db.importBatch.findUniqueOrThrow({ where: { syntheticKey: key } });
    demoPharmacyId = batch.pharmacyId;
    demoUploaderId = batch.uploadedBy;
    assert.equal(batch.isSynthetic, true);
    assert.equal((await db.pharmacy.findUniqueOrThrow({ where: { pharmacyId: demoPharmacyId } })).isSynthetic, true);
    assert.equal(await persistPharmacy(...args), null);
    const stock = await db.stockItem.findFirstOrThrow({ where: { pharmacyId: batch.pharmacyId } });
    const sales = await db.sale.findMany({ where: { stockId: stock.stockId } });
    assert.equal(sales.length, 12);
    assert.equal(stock.quantity, result.initial + result.replenished - sales.reduce((sum, sale) => sum + sale.quantity, 0));
  });
});
