import { applyDecorators, BadRequestException, Controller, Get, Header, Query, Req, StreamableFile } from '@nestjs/common';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { optionalQueryId } from '../../common/query-id';
import { type AuthRequest, Permissions } from '../auth/auth.guard';
import { validDate } from '../imports/import-file';
import { ReportsService } from './reports.service';

function reportQuery() {
  return applyDecorators(
    ApiQuery({ name: 'from', type: String, description: 'First calendar day YYYY-MM-DD in Europe/Kyiv' }),
    ApiQuery({ name: 'to', type: String, description: 'Last calendar day YYYY-MM-DD inclusive; maximum 366 days' }),
    ApiQuery({ name: 'pharmacyId', type: Number, required: false, description: 'Either donor or recipient pharmacy' }),
    ApiBadRequestResponse({ description: 'Invalid period, pharmacy ID, or format' }),
    ApiForbiddenResponse({ description: 'Manager with STATS_VIEW and NETWORK_VIEW required' }),
    ApiNotFoundResponse({ description: 'Unknown pharmacy' }),
  );
}

function period(query: Record<string, unknown>) {
  const { from, to } = query;
  if (!validDate(from) || !validDate(to) || from > to || +new Date(to) - +new Date(from) > 365 * 86_400_000) {
    throw new BadRequestException('Provide a valid inclusive date range of at most 366 days');
  }
  return { from, to, pharmacyId: optionalQueryId(query.pharmacyId, 'pharmacyId') };
}

const csvType = 'text/csv; charset=utf-8';
const xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('reports')
@Permissions('STATS_VIEW', 'NETWORK_VIEW')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @Header('Cache-Control', 'no-store')
  @reportQuery()
  @ApiOperation({ summary: 'Summarize stock risks and redistribution for a calendar period' })
  @ApiOkResponse({ schema: { example: { period: { from: '2026-11-01', to: '2026-11-22', timeZone: 'Europe/Kyiv' },
    pharmacyId: null, totals: { shortageRisks: 15, surplusPositions: 4, recommendations: 3,
      confirmed: 2, dispatched: 2, completed: 1, movedUnits: 12 } } } })
  summary(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) {
    const { from, to, pharmacyId } = period(query);
    return this.reports.summary(req.principal!, from, to, pharmacyId);
  }

  @Get('export')
  @Header('Cache-Control', 'no-store')
  @reportQuery()
  @ApiQuery({ name: 'format', enum: ['csv', 'xlsx'] })
  @ApiProduces(csvType, xlsxType)
  @ApiOperation({ summary: 'Download the same summary as UTF-8 CSV or XLSX' })
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async export(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) {
    const { from, to, pharmacyId } = period(query);
    const format = query.format;
    if (format !== 'csv' && format !== 'xlsx') throw new BadRequestException('Expected format=csv or format=xlsx');
    const file = await this.reports.export(req.principal!, from, to, pharmacyId, format);
    return new StreamableFile(file, { type: format === 'csv' ? csvType : xlsxType,
      disposition: 'attachment; filename="pharmabalance-' + from + '_' + to + '.' + format + '"' });
  }
}
