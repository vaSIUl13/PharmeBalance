import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closedThrough } from '../../src/modules/demo-day/demo-report';
import { forecastSlot, untilNextForecastSlot } from '../../src/modules/forecasts/forecast-schedule';

test('the worker wakes at the Kyiv close even if started between half-hour boundaries', () => {
  const started = new Date('2026-11-25T17:47:23+02:00');
  const next = new Date(+started + untilNextForecastSlot(started));
  assert.equal(next.toISOString(), '2026-11-25T16:00:00.000Z');
  assert.equal(closedThrough(started), '2026-11-24');
  assert.equal(closedThrough(next), '2026-11-25');
  assert.equal(forecastSlot(new Date(+next + 120_000)).toISOString(), next.toISOString());
  assert.equal(untilNextForecastSlot(next), 30 * 60_000);
});
