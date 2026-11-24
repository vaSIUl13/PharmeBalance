import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

export const demoDayDocs = {
  controller: ApiTags('demo-day'),
  status: ApiOperation({ summary: 'Read the latest synthetic business day as SuperAdmin' }),
  close: applyDecorators(
    ApiOperation({ summary: 'Generate, import and forecast the next synthetic business day as SuperAdmin' }),
    ApiBody({ schema: { type: 'object', required: ['day'], properties: { day: { type: 'string', format: 'date' } } } }),
    ApiForbiddenResponse({ description: 'Requires a SuperAdmin session and a demo database' }),
  ),
};
