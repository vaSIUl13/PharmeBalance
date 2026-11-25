import { createServer } from 'node:http';
import { canScrape, DurationHistogram, prometheusContentType } from '../health/prometheus';

const metric = 'pharmabalance_forecast_cycle_duration_seconds';
const buckets = [0.1, 0.5, 1, 2.5, 5, 10, 15, 30, 60, 120, 300];

export class ForecastMetrics {
  private readonly success = new DurationHistogram(buckets);
  private readonly error = new DurationHistogram(buckets);
  private lastSuccess?: number;
  private lastCutoff?: number;

  succeeded(seconds: number, day: string, now = new Date()) {
    this.success.observe(seconds);
    this.lastSuccess = now.getTime() / 1000;
    this.lastCutoff = Date.parse(day) / 1000;
  }

  failed(seconds: number) {
    this.error.observe(seconds);
  }

  collect(): string {
    return [
      '# HELP ' + metric + ' Forecast worker cycle duration in seconds, including demo catch-up.',
      '# TYPE ' + metric + ' histogram',
      ...this.success.lines(metric, { status: 'success' }),
      ...this.error.lines(metric, { status: 'error' }),
      '# HELP pharmabalance_forecast_last_success_timestamp_seconds Unix time of the last successful worker cycle.',
      '# TYPE pharmabalance_forecast_last_success_timestamp_seconds gauge',
      'pharmabalance_forecast_last_success_timestamp_seconds ' + (this.lastSuccess ?? 0),
      '# HELP pharmabalance_forecast_data_timestamp_seconds Unix time of the last successful forecast data cutoff.',
      '# TYPE pharmabalance_forecast_data_timestamp_seconds gauge',
      'pharmabalance_forecast_data_timestamp_seconds ' + (this.lastCutoff ?? 0),
      '',
    ].join('\n');
  }
}

export async function listenForecastMetrics(metrics: ForecastMetrics, setting?: string) {
  if (!setting) return undefined;
  const port = Number(setting);
  if (!/^\d+$/.test(setting) || !Number.isInteger(port) || port < 1 || port > 65535 || !process.env.METRICS_TOKEN) {
    throw new Error('Configure a valid FORECAST_METRICS_PORT and a METRICS_TOKEN');
  }
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/metrics' || !canScrape(request.headers.authorization)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': prometheusContentType, 'Cache-Control': 'no-store' }).end(metrics.collect());
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return () => new Promise<void>((resolve, reject) => server.close(error => {
    if (error) reject(error);
    else resolve();
  }));
}
