import { BadRequestException, Controller, Get, Header, Query, Req } from '@nestjs/common';
import { forecastsDocs } from '../../swagger/path/forecasts';
import { optionalQueryId } from '../../common/query-id';
import type { AuthRequest } from '../auth/auth.guard';
import { validDate } from '../imports/import-file';
import { ForecastsService, type ForecastView } from './forecasts.service';

@forecastsDocs.controller
@Controller()
export class ForecastsController {
  constructor(private readonly forecasts: ForecastsService) {}

  private read(req: AuthRequest, query: Record<string, unknown>, view: ForecastView) {
    if (query.asOf !== undefined && !validDate(query.asOf)) throw new BadRequestException('Invalid asOf');
    return this.forecasts.list(req.principal!, view, optionalQueryId(query.pharmacyId, 'pharmacyId'),
      optionalQueryId(query.after, 'after'), query.asOf ? new Date(query.asOf) : undefined);
  }

  @forecastsDocs.list
  @Get('forecasts')
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) { return this.read(req, query, 'forecasts'); }

  @forecastsDocs.risks
  @Get('risks')
  @Header('Cache-Control', 'no-store')
  risks(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) { return this.read(req, query, 'risks'); }

  @forecastsDocs.surpluses
  @Get('surpluses')
  @Header('Cache-Control', 'no-store')
  surpluses(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) { return this.read(req, query, 'surpluses'); }

  @forecastsDocs.classes
  @Get('classifications')
  @Header('Cache-Control', 'no-store')
  classes(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) { return this.read(req, query, 'classifications'); }
}
