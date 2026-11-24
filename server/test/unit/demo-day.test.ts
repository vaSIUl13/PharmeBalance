import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closedThrough, nextDay, simulatePosition } from '../../src/modules/demo-day/demo-report';

test('the automatic cutoff uses 18:00 in Kyiv across daylight-saving changes', () => {
  assert.equal(closedThrough(new Date('2026-11-24T15:59:59Z')), '2026-11-23');
  assert.equal(closedThrough(new Date('2026-11-24T16:00:00Z')), '2026-11-24');
  assert.equal(closedThrough(new Date('2026-07-24T14:59:59Z')), '2026-07-23');
  assert.equal(closedThrough(new Date('2026-07-24T15:00:00Z')), '2026-07-24');
  assert.equal(nextDay('2026-12-31'), '2027-01-01');
});

test('daily sales and deliveries are deterministic and never consume reserved inventory', () => {
  const stock = { stockId: 4, pharmacyId: 2, sku: 'SYN-DEV-00001',
    quantity: 20, reserved: 20, msl: 8, maxLevel: 20, average: 12, unitPrice: '51.25' };
  for (const day of ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24']) {
    const row = simulatePosition(stock, day);
    assert.deepEqual(row, simulatePosition(stock, day));
    assert.equal(row.closing, row.opening + row.received - row.sold + row.returned);
    assert(row.closing >= stock.reserved);
    assert(row.sold <= row.opening + row.received - stock.reserved);
    assert(row.returned <= row.sold);
  }
});
