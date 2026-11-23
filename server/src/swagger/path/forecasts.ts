import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

export const forecastsDocs = {
  controller: applyDecorators(
    ApiQuery({ name: 'asOf', required: false, type: String, description: 'UTC sales cutoff YYYY-MM-DD; defaults to the latest published run' }),
    ApiQuery({ name: 'after', required: false, type: Number, description: 'Forecast ID returned in next' }),
    ApiQuery({ name: 'pharmacyId', required: false, type: Number }),
    ApiTags('forecasts'),
  ),
  list: ApiOperation({ summary: '14-day demand, probability below MSL and data quality by pharmacy and SKU' }),
  risks: ApiOperation({ summary: 'Positions at risk of falling below MSL, highest probability first' }),
  surpluses: ApiOperation({ summary: 'Current surplus above Max and estimated surplus at the end of the horizon' }),
  classes: ApiOperation({ summary: 'Dated ABC and XYZ classes with turnover and variation diagnostics' }),
};
