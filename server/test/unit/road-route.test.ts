import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roadRoute } from '../../src/modules/recommendations/road-route';

test('maps OSRM geometry and handles missing and invalid routes', async t => {
  const original = process.env.OSRM_BASE_URL;
  process.env.OSRM_BASE_URL = 'https://router.example.invalid/routed-car/';
  t.after(() => {
    if (original === undefined) delete process.env.OSRM_BASE_URL;
    else process.env.OSRM_BASE_URL = original;
  });
  const from = { longitude: 24.03, latitude: 49.84 };
  const to = { longitude: 24.034, latitude: 49.842 };
  const coordinates = [[from.longitude, from.latitude], [to.longitude, to.latitude]];
  const geometry = { type: 'LineString', coordinates };
  const response = t.mock.method(globalThis, 'fetch', async (url: URL) => {
    assert.equal(url.pathname, '/routed-car/route/v1/driving/24.03,49.84;24.034,49.842');
    assert.equal(url.searchParams.get('geometries'), 'geojson');
    return Response.json({ code: 'Ok', routes: [{ distance: 420, duration: 76, geometry }] });
  });
  assert.deepEqual(await roadRoute(from, to), { status: 'ready', distanceMeters: 420, durationSeconds: 76, coordinates });
  response.mock.mockImplementationOnce(async () => Response.json({ code: 'NoRoute' }, { status: 400 }));
  assert.deepEqual(await roadRoute(from, to), { status: 'no-route' });
  response.mock.mockImplementationOnce(async () => Response.json({ code: 'Ok',
    routes: [{ distance: 420, duration: 76, geometry: { ...geometry, coordinates: [[181, 49], [24, 49]] } }] }));
  assert.deepEqual(await roadRoute(from, to), { status: 'unavailable' });
  response.mock.mockImplementationOnce(async () => { throw new Error('provider unavailable'); });
  assert.deepEqual(await roadRoute(from, to), { status: 'unavailable' });
});
