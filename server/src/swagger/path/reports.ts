import { applyDecorators } from '@nestjs/common';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { reportMediaTypes } from '../../modules/reports/report-media-types';

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

export const reportsDocs = {
  controller: ApiTags('reports'),
  summary: applyDecorators(
    ApiOkResponse({ schema: { example: { period: { from: '2026-11-01', to: '2026-11-22', timeZone: 'Europe/Kyiv' },
        pharmacyId: null, totals: { shortageRisks: 15, surplusPositions: 4, recommendations: 3,
          confirmed: 2, dispatched: 2, completed: 1, movedUnits: 12 } } } }),
    ApiOperation({ summary: 'Summarize stock risks and redistribution for a calendar period' }),
    reportQuery(),
  ),
  export: applyDecorators(
    ApiOkResponse({ schema: { type: 'string', format: 'binary' } }),
    ApiOperation({ summary: 'Download the same summary as UTF-8 CSV or XLSX' }),
    ApiProduces(reportMediaTypes.csv, reportMediaTypes.xlsx),
    ApiQuery({ name: 'format', enum: ['csv', 'xlsx'] }),
    reportQuery(),
  ),
};
