import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { createStockInput, stockThresholdsInput, validateLevels } from '../../src/modules/stocks/dto/stock-input';

const stock = { pharmacyId: 1, sku: 'SKU', msl: 0, maxLevel: 0 };
const maxInteger = 2147483647;

test('new stock accepts equal thresholds, trims SKU and defaults quantity to zero', () => {
  assert.deepEqual(createStockInput({ ...stock, sku: ' SKU ' }), { ...stock, quantity: 0 });
  const maximum = { pharmacyId: maxInteger, quantity: maxInteger, msl: maxInteger, maxLevel: maxInteger, sku: 'x'.repeat(30) };
  assert.deepEqual(createStockInput(maximum), maximum);
});

test('stock validation rejects invalid quantities, pharmacy IDs, thresholds and SKU lengths', () => {
  for (const fields of [
    { quantity: -1 }, { quantity: 0.5 }, { quantity: maxInteger + 1 }, { quantity: '0' },
    { msl: -1 }, { maxLevel: -1 }, { msl: 1, maxLevel: 0 }, { pharmacyId: 0 },
    { sku: ' ' }, { sku: 'x'.repeat(31) }, { unexpected: 1 },
  ]) {
    assert.throws(() => createStockInput({ ...stock, ...fields }), BadRequestException);
  }
  for (const input of [null, [], {}]) assert.throws(() => createStockInput(input), BadRequestException);
});

test('threshold updates accept either bound and validate the resulting pair', () => {
  assert.deepEqual(stockThresholdsInput({ msl: 0 }), { msl: 0, maxLevel: undefined });
  assert.deepEqual(stockThresholdsInput({ maxLevel: maxInteger }), { msl: undefined, maxLevel: maxInteger });
  for (const input of [{}, { quantity: 2 }, { msl: '0' }, { maxLevel: -1 }, { maxLevel: maxInteger + 1 }]) {
    assert.throws(() => stockThresholdsInput(input), BadRequestException);
  }
  assert.doesNotThrow(() => validateLevels(5, 5));
  assert.throws(() => validateLevels(5, 4), BadRequestException);
});
