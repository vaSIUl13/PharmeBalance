import { BadRequestException, Controller, Get, Header, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { optionalQueryId } from '../../common/query-id';
import type { AuthRequest } from '../auth/auth.guard';
import { validDate } from '../imports/import-file';
import { ForecastsService, type ForecastView } from './forecasts.service';

@ApiTags('forecasts')
@ApiQuery({ name: 'pharmacyId', required: false, type: Number })
@ApiQuery({ name: 'after', required: false, type: Number, description: 'Forecast ID returned in next' })
@ApiQuery({ name: 'asOf', required: false, type: String, description: 'UTC sales cutoff YYYY-MM-DD; defaults to the latest published run' })
@Controller()
export class ForecastsController {
  constructor(private readonly forecasts: ForecastsService) {}

  private read(req: AuthRequest, query: Record<string, unknown>, view: ForecastView) {
    if (query.asOf !== undefined && !validDate(query.asOf)) throw new BadRequestException('Invalid asOf');
    return this.forecasts.list(req.principal!, view, optionalQueryId(query.pharmacyId, 'pharmacyId'),
      optionalQueryId(query.after, 'after'), query.asOf ? new Date(query.asOf) : undefined);
  }

  @Get('forecasts')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '14-day demand, probability below MSL and data quality by pharmacy and SKU' })
  list(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) { return this.read(req, query, 'forecasts'); }

  @Get('risks')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Positions at risk of falling below MSL, highest probability first' })
  risks(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) { return this.read(req, query, 'risks'); }

  @Get('surpluses')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Current surplus above Max and estimated surplus at the end of the horizon' })
  surpluses(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) { return this.read(req, query, 'surpluses'); }

  @Get('classifications')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Dated ABC and XYZ classes with turnover and variation diagnostics' })
  classes(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) { return this.read(req, query, 'classifications'); }
}
