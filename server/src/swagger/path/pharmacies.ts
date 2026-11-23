import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

export const pharmaciesDocs = {
  controller: ApiTags('pharmacies'),
  list: applyDecorators(
    ApiQuery({ name: 'after', required: false, type: Number }),
    ApiOperation({ summary: 'List managed pharmacies visible to the current user' }),
  ),
  external: ApiOperation({ summary: 'Search external pharmacy records' }),
  detail: ApiOperation({ summary: 'View a managed pharmacy within the current user scope' }),
  create: applyDecorators(
    ApiOperation({ summary: 'Create a managed pharmacy' }),
    ApiBody({ schema: { type: 'object', required: ['code', 'name', 'city', 'address', 'latitude', 'longitude'],
        properties: {
          code: { type: 'string', maxLength: 20 }, name: { type: 'string', maxLength: 100 },
          city: { type: 'string', maxLength: 60 }, address: { type: 'string', maxLength: 150 },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          externalRecordIds: { type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 10 },
        },
      } }),
  ),
};
