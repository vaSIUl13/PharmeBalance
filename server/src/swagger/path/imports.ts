import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';

function importForm(stocks: boolean) {
  return applyDecorators(
    ApiConsumes('multipart/form-data'),
    ApiBody({ schema: { type: 'object', required: stocks ? ['file', 'pharmacyId', 'snapshotAt'] : ['file', 'pharmacyId'],
      properties: { file: { type: 'string', format: 'binary', description: 'UTF-8 .csv or .json, up to 1 MiB and 5000 records' },
        pharmacyId: { type: 'integer', minimum: 1 },
        ...(stocks ? { snapshotAt: { type: 'string', format: 'date-time', description: 'Observed instant in UTC (Z)' } } : {}) } } }),
    ApiUnprocessableEntityResponse({ description: 'REJECTED batch with row errors. No inventory or sales changes.' }),
  );
}

export const importsDocs = {
  controller: ApiTags('imports'),
  history: applyDecorators(
    ApiQuery({ name: 'before', required: false, type: Number }),
    ApiOperation({ summary: 'Import history of the assigned pharmacy' }),
  ),
  detail: ApiOperation({ summary: 'View a batch and its row errors' }),
  stocks: applyDecorators(
    ApiOperation({ summary: 'Import absolute quantities for listed SKUs', description: 'CSV header: sku,quantity. JSON: [{"sku":"CAT-SAMPLE-0001","quantity":8}].' }),
    importForm(true),
  ),
  sales: applyDecorators(
    ApiOperation({ summary: 'Import daily sales', description: 'CSV header: sku,date,quantity. JSON: [{"sku":"CAT-SAMPLE-0001","date":"2026-01-30","quantity":2}]. Optional returnedQuantity, unitPrice, stockout, replacesImportId. Set stockout=true for known unavailable stock; omit for unknown availability. Corrections replace the whole daily aggregate and must name its current import ID.' }),
    importForm(false),
  ),
};
