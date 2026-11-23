const { Prisma } = require('@prisma/client');

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return value.toFixed(6);
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function equal(current, incoming) {
  const existing = Object.fromEntries(Object.keys(incoming).map((key) => [key, current[key]]));
  return JSON.stringify(canonical(existing)) === JSON.stringify(canonical(incoming));
}

module.exports = { canonical, equal };
