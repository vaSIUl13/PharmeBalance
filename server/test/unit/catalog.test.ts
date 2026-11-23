import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDrlz, parseOverpass, parsePharmacyCsv, packageKey, drlzUrl, createHttpClient, makeSource, PROFILES, simulate } from './catalog-scripts';

test('nationwide OSM sync saves a validated snapshot and leaves existing files intact', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pharma-osm-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const snapshot = join(dir, 'pharmacies.json');
  const provider = 'https://example.invalid/api/interpreter';
  const body = { elements: [{ type: 'node', id: 1, lat: 50, lon: 30, tags: { amenity: 'pharmacy', name: 'Pharmacy' } }] };
  const options = { ukraine: true, 'overpass-url': provider, 'save-snapshot': snapshot } as const;
  const adapter = await makeSource('osm', options, () => async (url, request) => {
    assert.equal(url, provider);
    assert.match(request.body.get('data') ?? '', /ISO3166-1"="UA"[\s\S]+nwr\["amenity"="pharmacy"\]\(area\.ua\)/);
    return { body };
  });
  assert.equal(adapter.scope, provider + '|UA');
  assert.equal((await adapter.page()).records[0].externalId, 'node:1');
  await adapter.saveSnapshot();
  assert.deepEqual(JSON.parse(await readFile(snapshot, 'utf8')), body);
  const repeated = await makeSource('osm', options, () => async () => ({ body }));
  await repeated.page();
  await assert.rejects(repeated.saveSnapshot(), { code: 'EEXIST' });
});

test('registry preserves multiple packages and manufacturer roles', () => {
  const row = parseDrlz({
    id: 'ua-7888-01-01', attributes: {
      number: 'UA/7888/01/01', title: 'Test medicine', is_current: true,
      atc_codes: ['J01DB01'], manufacturers: [{ name: 'Manufacturer', role: 'packaging', country: 'UA' }],
    },
  }, { id: 'version-1', attributes: { packages: [
    { form: 'capsules', dose: '250 mg', primary: 'blister', quantity: '10', primary_count: '10' },
    { form: 'capsules', dose: '250 mg', primary: 'blister', quantity: '20', primary_count: '20' },
  ] } });
  assert.equal(row.number, 'UA/7888/01/01');
  assert.equal(row.manufacturers[0].role, 'packaging');
  assert.notEqual(row.packages[0].key, row.packages[1].key);
  assert.equal(packageKey({ dose: '250 mg', form: 'capsules' }), packageKey({ form: 'CAPSULES', dose: '250  mg' }));
});

test('OSM preserves object types and approximate coordinates', () => {
  const tags = { amenity: 'pharmacy', name: 'Test pharmacy', 'addr:street': 'Test', 'addr:housenumber': '11' };
  const rows = parseOverpass({ elements: [
    { id: 100, type: 'node', lat: 49, lon: 24, tags },
    { id: 100, type: 'way', center: { lat: 49, lon: 24 }, tags },
  ] });
  assert.deepEqual(rows.map((r) => r.externalId), ['node:100', 'way:100']);
  assert.equal(rows[1].coordinateQuality, 'CENTER');
  assert.equal(rows[0].address, 'Test 11');
  assert.throws(() => parseOverpass({ elements: [], remark: 'runtime error: timeout' }));
});

test('CSV supports explicit mappings and keeps unknown coordinates empty', () => {
  const rows = parsePharmacyCsv('division;brand;locality;address\r\n42;"Test; Pharmacy";Lviv;"Long, 5"\r\n', {
    externalId: 'division', name: 'brand', city: 'locality', address: 'address',
  }, ';');
  assert.equal(rows[0].externalId, '42');
  assert.equal(rows[0].name, 'Test; Pharmacy');
  assert.equal(rows[0].latitude, null);
  assert.throws(() => parsePharmacyCsv('location,brand\n42,Test\n', { externalId: 'division', name: 'brand' }));
});

test('demo profiles are deterministic and stock reconciles with sales and replenishment', () => {
  assert.deepEqual(PROFILES.dev, { pharmacies: 15, drugs: 500, days: 90, assortment: 150 });
  assert.deepEqual(PROFILES.performance, { pharmacies: 50, drugs: 5000, days: 120, assortment: 600 });
  const samples = [0, 1, 2, 3].map((pharmacy) => simulate(42, pharmacy, 0, 90, new Date('2026-11-20T00:00:00Z')));
  assert(samples[0].quantity < samples[0].msl);
  assert(samples[1].quantity > samples[1].maxLevel);
  assert(samples[2].quantity > samples[2].maxLevel);
  for (const s of samples) {
    assert.equal(s.quantity, s.initial + s.replenished - s.sales.reduce((sum, sale) => sum + sale.quantity, 0));
    assert(s.sales.every((sale) => sale.quantity <= sale.demand));
    assert(s.msl <= s.maxLevel);
  }
  assert.deepEqual(samples[0], simulate(42, 0, 0, 90, new Date('2026-11-20T00:00:00Z')));
});

test('incremental DRLZ since uses second precision and permits only its own cursor endpoint', async () => {
  const adapter = await makeSource('drlz', { mode: 'incremental' });
  const checkpoint = adapter.start('2026-11-20T00:00:00.123Z');
  assert.equal(new URL(checkpoint.url).searchParams.get('since'), '2026-11-20T00:00:00Z');
  assert.throws(() => drlzUrl('https://example.com/api/v1/changes?after=token', 'changes'));
});

test('HTTP client backs off after 429 and stops after a permanent error', async (t) => {
  let attempts = 0;
  const server = createServer((request, response) => {
    if (request.url === '/bad') { response.writeHead(400).end(); return; }
    attempts++;
    if (attempts === 1) response.writeHead(429, { 'Retry-After': '1' }).end();
    else response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert(address && typeof address === 'object');
  const url = 'http://127.0.0.1:' + address.port;
  const request = createHttpClient({ interval: 0, timeout: 2000 });
  const start = Date.now();
  assert.deepEqual((await request(url)).body, { ok: true });
  assert.equal(attempts, 2);
  assert(Date.now() - start >= 1000);
  await assert.rejects(request(url + '/bad'), /HTTP 400/);
});

