import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { HttpMetricsService } from './http-metrics.service';
import { MetricsController } from './metrics.controller';

@Module({
  controllers: [HealthController, MetricsController],
  providers: [HealthService, HttpMetricsService],
})
export class HealthModule {}
