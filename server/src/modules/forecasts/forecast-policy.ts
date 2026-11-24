import { basePolicy } from './forecast-model';

export function loadForecastPolicy() {
  const policy = { ...basePolicy };
  for (const [key, name] of [['abcA', 'FORECAST_ABC_A'], ['abcB', 'FORECAST_ABC_B'],
    ['xyzX', 'FORECAST_XYZ_X'], ['xyzY', 'FORECAST_XYZ_Y']] as const) {
    const raw = process.env[name];
    if (raw === undefined) continue;
    if (!raw.trim() || !Number.isFinite(Number(raw)) || Number(raw) <= 0) throw Error('Set a positive ' + name);
    policy[key] = Number(raw);
  }
  if (policy.abcA >= policy.abcB || policy.abcB >= 1 || policy.xyzX >= policy.xyzY) throw Error('Invalid classification boundaries');
  return policy;
}
