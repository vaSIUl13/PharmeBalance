import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFile, snapshotTime, maxBytes } from '../../src/modules/imports/import-file';
const json = (rows: unknown[]) => parseFile(Buffer.from(JSON.stringify(rows)), 'JSON', 'SALES');
const csv = (text: string) => parseFile(Buffer.from(text), 'CSV', 'STOCKS');

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
  assert.equal(snapshotTime('2024-02-29T00:00:00.12Z')?.toISOString(), '2024-02-29T00:00:00.120Z');
});

test('daily sales distinguish a reported zero, a stockout and unknown availability', () => {
  const records = [
    { sku: 'A', quantity: 0, date: '2024-03-01', stockout: false },
    { sku: 'A', quantity: 0, date: '2024-03-02', stockout: true },
    { sku: 'A', quantity: 0, date: '2024-03-03' },
  ];
  const parsed = json(records);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rows.map(row => row.stockout), [false, true, null]);
  const csvSales = 'sku,quantity,date,stockout\nA,0,2024-03-01,false\nA,0,2024-03-02,true\nA,0,2024-03-03,';
  assert.deepEqual(parseFile(Buffer.from(csvSales), 'CSV', 'SALES'), parsed);
  assert.deepEqual(json([{ ...records[0], stockout: 'false' }]).errors, [{ row: 1, message: 'Invalid stockout flag' }]);
});
