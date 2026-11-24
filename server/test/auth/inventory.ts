import type { TestContext } from 'node:test';
import type { SignedInFixture } from './fixture';
import assert = require('node:assert/strict');

export async function testInventory(t: TestContext, context: SignedInFixture) {
  const { origin, db, root, run, accounts, pharmacyIds, drugIds, stockIds, transferIds, forecastRunIds, request, cookie, login, admin, head } = context;
  let manager: string | undefined;
  await t.test('pharmacy and transfer scopes update on the next request', async () => {
    for (let i = 0; i < 2; i++) {
      const pharmacy = await db.pharmacy.create({ data: {
        code: 'A' + run + i, name: 'Test', city: 'Test', address: 'Test',
        latitude: 49, longitude: 24,
      } });
      pharmacyIds.push(pharmacy.pharmacyId);
    }
    const drug = await db.drug.create({ data: { sku: 'AUTH-' + run, name: 'Test', dosageForm: 'Test', unit: 'Test' } });
    drugIds.push(drug.drugId);
    for (const pharmacyId of pharmacyIds) {
      const stock = await db.stockItem.create({ data: { pharmacyId, drugId: drug.drugId, maxLevel: 10 } });
      stockIds.push(stock.stockId);
    }
    const recommendation = await db.recommendation.create({
      data: { donorStockId: stockIds[1], recipientStockId: stockIds[0], quantity: 1, priority: 1, status: 'IN_PROGRESS' },
    });
    transferIds.push(recommendation.recommendationId);
    const scope = { userId: accounts.head.userId, pharmacyId: pharmacyIds[0] };
    const detail = '/recommendations/' + recommendation.recommendationId;
    assert.equal((await request(detail, { cookies: head })).status, 404);
    await db.userPharmacy.create({ data: scope });
    const forecastRun = await db.forecastRun.create({ data: {
      asOf: new Date('2001-01-01'), version: run, synthetic: false, policy: {},
    } });
    forecastRunIds.push(forecastRun.id);
    await db.forecast.createMany({ data: stockIds.map(stockId => ({ stockId, modelVersion: 'fixture',
      runId: forecastRun.id, predictedDemand: 5, shortageProbability: 0.5, currentSurplus: 2 })) });
    for (const endpoint of ['forecasts','risks','classifications','surpluses']) {
      const route = '/' + endpoint + '?asOf=2001-01-01';
      const own = await request(route, { cookies: head });
      assert.equal(own.status, 200);
      assert.deepEqual((await own.json()).items.map((row: { stockId: number }) => row.stockId), [stockIds[0]]);
      const foreign = await request(route + '&pharmacyId=' + pharmacyIds[1], { cookies: head });
      assert.deepEqual((await foreign.json()).items, []);
      assert.equal((await request(route, { cookies: admin })).status, 403);
    }
    assert.deepEqual((await (await request('/stocks', { cookies: head })).json()).map((row: { pharmacyId: number }) => row.pharmacyId), [pharmacyIds[0]]);
    assert.equal((await request(detail, { cookies: head })).status, 200);
    const permission = await db.permission.findUniqueOrThrow({ where: { code: 'PHARMACY_VIEW' } });
    const grant = { roleId: accounts.head.roleId, permissionId: permission.permissionId };
    await db.rolePermission.delete({ where: { roleId_permissionId: grant } });
    try {
      assert.deepEqual(await (await request('/stocks', { cookies: head })).json(), []);
    } finally {
      await db.rolePermission.create({ data: grant });
    }
    assert.equal((await request(detail, { cookies: head })).status, 200);
    await db.userPharmacy.update({ where: { userId_pharmacyId: scope }, data: { unassignedAt: new Date() } });
    assert.equal((await request(detail, { cookies: head })).status, 404);
    manager = cookie(await login('manager'));
    assert.equal((await request(detail, { cookies: manager })).status, 200);
    const headRole = await db.role.findUniqueOrThrow({ where: { code: 'head' } });
    await db.userAccount.update({ where: { userId: accounts.manager.userId }, data: { roleId: headRole.roleId } });
    assert.equal((await request(detail, { cookies: manager })).status, 404);
    await db.userAccount.update({ where: { userId: accounts.manager.userId }, data: { roleId: accounts.manager.roleId } });
  });

  await t.test('stock creation, scoped reads and atomic threshold edits', async () => {
    const pharmacyId = pharmacyIds[0];
    const drugs = await db.drug.findMany({ where: { isActive: true, drugId: { notIn: drugIds } },
      orderBy: [{ registrationId: { sort: 'asc', nulls: 'last' } }, { drugId: 'asc' }], take: 2 });
    while (drugs.length < 2) {
      const drug = await db.drug.create({ data: { sku: 'INV-' + run + drugs.length, name: 'Stock fixture', dosageForm: 'tablet', unit: 'pack' } });
      drugs.push(drug);
      drugIds.push(drug.drugId);
    }
    const create = (cookies: string | undefined, body: unknown) => request('/stocks', { method: 'POST', cookies, body });
    const base = { pharmacyId, sku: drugs[0].sku, msl: 2, maxLevel: 10, quantity: 12 };
    assert.equal((await create(head, base)).status, 403);
    assert.equal((await create(admin, { ...base, msl: -1 })).status, 400);
    assert.equal((await create(admin, { ...base, sku: 'MISSING-' + run })).status, 404);
    const created = await Promise.all([create(admin, base), create(manager, base)]);
    const success = created.find(r => r.status === 201);
    assert.ok(success);
    const stock = await success.json();
    stockIds.push(stock.stockId);
    assert.deepEqual(created.map(r => r.status).sort(), [201, 409]);
    const second = await create(manager, { pharmacyId, sku: drugs[1].sku, msl: 0, maxLevel: 0 });
    assert.equal(second.status, 201);
    const empty = await second.json();
    stockIds.push(empty.stockId);
    assert.equal(empty.quantity, 0);
    const patch = (cookies: string | undefined, body: unknown) => request('/stocks/' + stock.stockId + '/thresholds', { method: 'PATCH', cookies, body });
    assert.equal((await patch(head, { msl: 4 })).status, 403);
    assert.equal((await patch(manager, { maxLevel: 1 })).status, 400);
    assert.equal((await patch(manager, { quantity: 0 })).status, 400);
    const edits = await Promise.all([patch(manager, { msl: 9 }), patch(admin, { maxLevel: 5 })]);
    assert.deepEqual(edits.map(r => r.status).sort(), [200, 400]);
    const final = await patch(admin, { msl: 5, maxLevel: 5 });
    assert.equal(final.status, 200);
    assert.equal((await final.json()).quantity, 12);
    assert.equal((await patch(admin, { msl: 5 })).status, 200);
    assert.equal(await db.auditLog.count({ where: { stockId: stock.stockId, eventType: 'THRESHOLDS_CHANGED' } }), 3);
    const path = '/stocks?pharmacyId=' + pharmacyId + '&sku=' + encodeURIComponent(base.sku);
    assert.deepEqual((await (await request(path, { cookies: admin })).json()).map((row: { stockId: number }) => row.stockId), [stock.stockId]);
    assert.deepEqual(await (await request(path, { cookies: head })).json(), []);
  });

  await t.test('multipart imports enforce assignment, atomicity, replay and correction policy', async () => {
    const pharmacyId = pharmacyIds[0];
    const stock = await db.stockItem.findUniqueOrThrow({ where: { stockId: stockIds[0] }, include: { drug: true } });
    const { sku } = stock.drug;
    const assignment = { userId: accounts.head.userId, pharmacyId };
    await db.userPharmacy.update({ where: { userId_pharmacyId: assignment }, data: { unassignedAt: null } });
    const instant = new Date().toISOString();
    const snapshot = 'sku,quantity\n' + sku + ',17';
    async function upload(type: string, file: string, { id = pharmacyId, cookies = head, at = instant, ext = 'csv' } = {}) {
      const form = new FormData();
      form.append('pharmacyId', String(id));
      if (type === 'stocks') form.append('snapshotAt', at);
      form.append('file', new Blob([file]), 'sample.' + ext);
      return fetch(root + '/imports/' + type, { method: 'POST', body: form,
        headers: { Cookie: cookies, Origin: origin, 'X-Pharme-CSRF': '1' } });
    }
    for (const options of [{ cookies: manager }, { cookies: admin }, { id: pharmacyIds[1] }]) {
      assert.equal((await upload('stocks', snapshot, options)).status, 403);
    }
    await db.pharmacy.update({ where: { pharmacyId }, data: { isSynthetic: true } });
    try {
      assert.equal((await upload('stocks', snapshot)).status, 403);
    } finally {
      await db.pharmacy.update({ where: { pharmacyId }, data: { isSynthetic: false } });
    }
    assert.equal((await upload('stocks', 'x'.repeat(1024*1024+1))).status, 413);
    const bad = await upload('stocks', snapshot + '\nUNKNOWN-' + run + ',2');
    assert.equal(bad.status, 422);
    assert.equal((await bad.json()).errors[0].row, 2);
    const malformed = await upload('sales', '{', { ext: 'json' });
    assert.equal(malformed.status, 422);
    const rejected = await malformed.json();
    assert.equal(rejected.errors[0].row, 0);
    assert.equal((await (await upload('sales', '{', { ext: 'json' })).json()).importId, rejected.importId);
    assert.equal((await db.stockItem.findUniqueOrThrow({ where: { stockId: stock.stockId } })).quantity, stock.quantity);
    const receipts = await Promise.all([upload('stocks', snapshot), upload('stocks', snapshot)]);
    assert.deepEqual(receipts.map(r => r.status), [200, 200]);
    const [first, repeat] = await Promise.all(receipts.map(r => r.json()));
    assert.equal(first.importId, repeat.importId);
    assert.equal(first.recordsApplied, 1);
    const importNotices = await db.systemNotification.findMany({ where: {
      title: 'Оновлено дані залишків', message: { contains: `Імпорт №${first.importId} ·` },
      userId: { in: [accounts.admin.userId, accounts.superadmin.userId, accounts.manager.userId, accounts.head.userId, accounts.logist.userId] },
    }, select: { userId: true } });
    assert.equal(importNotices.length, 4);
    assert.deepEqual(new Set(importNotices.map(row => row.userId)),
      new Set([accounts.admin.userId, accounts.superadmin.userId, accounts.manager.userId, accounts.head.userId]));
    const current = () => db.stockItem.findUniqueOrThrow({ where: { stockId: stock.stockId } });
    assert.equal((await current()).quantity, 17);
    assert.equal((await upload('stocks', snapshot.replace(',17', ',18'))).status, 422);
    assert.equal((await upload('stocks', snapshot, { at: '2020-01-01T00:00:00Z' })).status, 422);
    await db.stockItem.update({ where: { stockId: stock.stockId }, data: { quantity: { decrement: 1 } } });
    assert((await current()).quantityAsOf > new Date(instant));
    assert.equal((await upload('stocks', snapshot + '\n')).status, 422);
    assert.equal((await current()).quantity, 16);
    const date = '2025-03-02';
    const submit = (rows: unknown) => upload('sales', JSON.stringify(rows), { ext: 'json' });
    const row = { sku, date, quantity: 5, unitPrice: '12.50' };
    const sales = await submit([row]);
    assert.equal(sales.status, 200);
    const original = await sales.json();
    assert.equal((await (await submit([row])).json()).importId, original.importId);
    assert.equal((await submit([row, row])).status, 422);
    const mixed = await submit([{ ...row, date: '2025-03-01' }, { ...row, quantity: 25 }]);
    assert.equal(mixed.status, 422);
    assert.equal(await db.sale.count({ where: { stockId: stock.stockId } }), 1);
    assert.equal((await submit([{ ...row, quantity: 2 }])).status, 422);
    const correction = (quantity: number) => submit([{ ...row, quantity, replacesImportId: original.importId }]);
    const concurrent = await Promise.all([correction(3), correction(4)]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 422]);
    const saved = await db.sale.findMany({ where: { stockId: stock.stockId } });
    assert.equal(saved.length, 1);
    assert([3, 4].includes(saved[0].quantity));
    assert.equal((await current()).quantity, 16);
    const path = '/imports/' + first.importId;
    assert.equal((await request(path, { cookies: head })).status, 200);
    assert((await (await request('/imports', { cookies: head })).json()).items.some((b: { importId: number }) => b.importId === first.importId));
    await db.userPharmacy.update({ where: { userId_pharmacyId: assignment }, data: { unassignedAt: new Date() } });
    assert.equal((await request(path, { cookies: head })).status, 404);
    assert.deepEqual((await (await request('/imports', { cookies: head })).json()).items, []);
  });
  assert(manager);
  return manager;
}
