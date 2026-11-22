const assert = require('node:assert/strict');
const { test } = require('node:test');
const { haversine, nearest } = require('../dist/modules/recommendations/donor-selection');

test('picks the nearest sufficient stock, breaking equal distances by pharmacy ID', () => {
  const donor = (pharmacyId, distance, available) => ({ stockId: pharmacyId, pharmacyId, distance, available });
  const candidates = [donor(1, 1, 9), donor(9, null, 99), donor(8, 2, 10), donor(2, 2, 10), donor(6, 5, 100)];
  assert.equal(nearest(candidates, 10).stockId, 2);
  assert.equal(nearest(candidates, 11).stockId, 6);
  assert.equal(nearest(candidates, 101), undefined);
});

test('haversine measures distance in kilometres and rejects invalid coordinates', () => {
  assert(Math.abs(haversine({latitude: 0, longitude: 0}, {latitude: 1, longitude: 0}) - 111.195) < 0.01);
  assert.equal(haversine({latitude: 95, longitude: 0}, {latitude: 0, longitude: 0}), null);
});
