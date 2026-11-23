import { BadRequestException, Controller, Get, Header, Query, Req, StreamableFile } from '@nestjs/common';
import { reportsDocs } from '../../swagger/path/reports';
import { optionalQueryId } from '../../common/query-id';
import { type AuthRequest, Permissions } from '../auth/auth.guard';
import { validDate } from '../imports/import-file';
import { reportMediaTypes } from './report-media-types';
import { ReportsService } from './reports.service';

function period(query: Record<string, unknown>) {
  const { from, to } = query;
  if (!validDate(from) || !validDate(to) || from > to || +new Date(to) - +new Date(from) > 365 * 86_400_000) {
    throw new BadRequestException('Provide a valid inclusive date range of at most 366 days');
  }
  return { from, to, pharmacyId: optionalQueryId(query.pharmacyId, 'pharmacyId') };
}

@reportsDocs.controller
@Permissions('STATS_VIEW', 'NETWORK_VIEW')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @reportsDocs.summary
  @Get('summary')
  @Header('Cache-Control', 'no-store')
  summary(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) {
    const { from, to, pharmacyId } = period(query);
    return this.reports.summary(req.principal!, from, to, pharmacyId);
  }

  @reportsDocs.export
  @Get('export')
  @Header('Cache-Control', 'no-store')
  async export(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) {
    const { from, to, pharmacyId } = period(query);
    const format = query.format;
    if (format !== 'csv' && format !== 'xlsx') throw new BadRequestException('Expected format=csv or format=xlsx');
    const file = await this.reports.export(req.principal!, from, to, pharmacyId, format);
    return new StreamableFile(file, { type: reportMediaTypes[format],
      disposition: 'attachment; filename="pharmabalance-' + from + '_' + to + '.' + format + '"' });
  }
}
