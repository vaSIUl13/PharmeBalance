import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { DurationHistogram } from './prometheus';

const metric = 'pharmabalance_http_request_duration_seconds';
const buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

@Injectable()
export class HttpMetricsService {
  private readonly requests = new Map<string, { labels: Record<string, string>; durations: DurationHistogram }>();

  readonly observe = (request: Request, response: Response, next: NextFunction) => {
    if (process.env.METRICS_TOKEN) {
      const started = performance.now();
      response.once('finish', () => {
        const template: unknown = request.route?.path;
        if (template === '/api/v1/metrics') return;
        const route = typeof template === 'string' ? template : 'unmatched';
        const labels = { method: request.method, route, status: String(response.statusCode) };
        const key = JSON.stringify(labels);
        let entry = this.requests.get(key);
        if (!entry) {
          entry = { labels, durations: new DurationHistogram(buckets) };
          this.requests.set(key, entry);
        }
        entry.durations.observe((performance.now() - started) / 1000);
      });
    }
    next();
  };

  collect(): string {
    return [
      '# HELP ' + metric + ' Duration of completed API requests in seconds.',
      '# TYPE ' + metric + ' histogram',
      ...[...this.requests.values()].flatMap(({ labels, durations }) => durations.lines(metric, labels)),
      '',
    ].join('\n');
  }
}
