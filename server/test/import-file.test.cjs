const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseFile, snapshotTime, maxBytes } = require('../dist/modules/imports/import-file');
const json = rows => parseFile(Buffer.from(JSON.stringify(rows)), 'JSON', 'SALES');
const csv = text => parseFile(Buffer.from(text), 'CSV', 'STOCKS');

test('UTF-8 BOM, zero demand, prices and record numbering', () => {
  assert.deepEqual(csv('\ufeffsku,quantity\r\nA,0\r\n').errors, []);
  const row = { sku: 'A', quantity: 0, date: '2024-02-29', unitPrice: '5.40' };
  assert.equal(json([row]).rows[0].unitPrice, '5.40');
  const saleCsv = parseFile(Buffer.from('sku,date,quantity,unitPrice\nA,2024-02-29,0,5.40'), 'CSV', 'SALES');
  assert.deepEqual(saleCsv.rows, json([row]).rows);
  const stockJson = parseFile(Buffer.from('[{"sku":"A","quantity":0}]'), 'JSON', 'STOCKS');
  assert.deepEqual(stockJson.rows, csv('sku,quantity\nA,0').rows);
  assert.equal(json([row, row]).errors[0].row, 2);
  for (const invalid of [{ date: '2025-02-29' }, { quantity: -1 }, { quantity: 1.5 }, { quantity: '1' },
    { unitPrice: '1.005' }, { unitPrice: {} }, { replacesImportId: 0 }, { sku: '' }, { pharmacyId: 1 }]) {
    assert.equal(json([{ ...row, ...invalid }]).errors[0].row, 1);
  }
  assert.equal(csv('sku,quantity\nA,1,2').errors[0].row, 1);
  assert.equal(csv('sku,quantity,sku\nA,1,A').errors[0].row, 0);
});

test('file envelope, encoding, size and UTC snapshot instant', () => {
  for (const file of [Buffer.from('{'), Buffer.from('{}'), Buffer.from('[]'), Buffer.from([0xff]), Buffer.alloc(maxBytes+1)]) {
    assert.equal(parseFile(file, 'JSON', 'STOCKS').errors[0].row, 0);
  }
  assert.equal(csv('sku,quantity\n' + 'A,0\n'.repeat(5001)).errors[0].row, 0);
  for (const invalid of ['2025-02-29T00:00:00Z', '2025-01-01', '2025-01-01T24:00:00Z', '2999-01-01T00:00:00Z']) {
    assert.equal(snapshotTime(invalid), undefined);
  }
  assert.equal(snapshotTime('2024-02-29T00:00:00.12Z').toISOString(), '2024-02-29T00:00:00.120Z');
});
