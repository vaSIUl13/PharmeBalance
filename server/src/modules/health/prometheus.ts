import { createHash, timingSafeEqual } from 'node:crypto';

export const prometheusContentType = 'text/plain; version=0.0.4; charset=utf-8';

export function canScrape(authorization?: string): boolean {
  const token = process.env.METRICS_TOKEN;
  if (!token || !authorization?.startsWith('Bearer ')) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(authorization.slice(7)), digest(token));
}

export function metricLabels(labels: Record<string, string>): string {
  return '{' + Object.entries(labels).map(([key, value]) =>
    key + '="' + value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('"', '\\"') + '"',
  ).join(',') + '}';
}

export class DurationHistogram {
  private readonly counters: number[];
  private count = 0;
  private sum = 0;

  constructor(private readonly limits: readonly number[]) {
    this.counters = limits.map(() => 0);
  }

  observe(seconds: number) {
    this.count++;
    this.sum += seconds;
    for (const [index, limit] of this.limits.entries()) {
      if (seconds <= limit) this.counters[index]++;
    }
  }

  lines(name: string, labels: Record<string, string>) {
    const bucket = (limit: string, count: number) => name + '_bucket' + metricLabels({ ...labels, le: limit }) + ' ' + count;
    const series = metricLabels(labels);
    return [
      ...this.limits.map((limit, index) => bucket(String(limit), this.counters[index])),
      bucket('+Inf', this.count),
      name + '_sum' + series + ' ' + this.sum,
      name + '_count' + series + ' ' + this.count,
    ];
  }
}
