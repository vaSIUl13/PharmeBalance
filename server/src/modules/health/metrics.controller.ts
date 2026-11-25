import { Controller, Get, Header, Headers, NotFoundException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/auth.guard';
import { HttpMetricsService } from './http-metrics.service';
import { canScrape, prometheusContentType } from './prometheus';

@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: HttpMetricsService) {}

  @Public()
  @Header('Content-Type', prometheusContentType)
  @Header('Cache-Control', 'no-store')
  @Get()
  scrape(@Headers('authorization') authorization?: string): string {
    if (!canScrape(authorization)) throw new NotFoundException();
    return this.metrics.collect();
  }
}
