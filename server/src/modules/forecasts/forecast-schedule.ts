const forecastIntervalMs = 30 * 60_000;

export function forecastSlot(now: Date) {
  return new Date(Math.floor(+now / forecastIntervalMs) * forecastIntervalMs);
}

export function untilNextForecastSlot(now: Date) {
  return +forecastSlot(now) + forecastIntervalMs - +now;
}
