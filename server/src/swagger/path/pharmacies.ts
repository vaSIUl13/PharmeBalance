import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

export const pharmaciesDocs = {
  controller: ApiTags('pharmacies'),
  list: applyDecorators(
    ApiQuery({ name: 'after', required: false, type: Number }),
    ApiOperation({ summary: 'List managed pharmacies visible to the current user' }),
  ),
  external: applyDecorators(
    ApiOperation({ summary: 'Search external pharmacy records' }),
    ApiQuery({ name: 'complete', required: false, enum: ['true'], description: 'Require name, city, address and coordinates' }),
  ),
  externalMap: applyDecorators(
    ApiOperation({ summary: 'List external pharmacy records inside a map bounding box' }),
    ApiQuery({ name: 'south', type: Number, description: 'Latitude -90..90' }),
    ApiQuery({ name: 'west', type: Number, description: 'Longitude -180..180' }),
    ApiQuery({ name: 'north', type: Number }),
    ApiQuery({ name: 'east', type: Number }),
    ApiQuery({ name: 'limit', required: false, type: Number, description: '1..1000, default 500; truncated=true when more records exist' }),
  ),
  detail: ApiOperation({ summary: 'View a managed pharmacy within the current user scope' }),
  create: applyDecorators(
    ApiOperation({ summary: 'Create a managed pharmacy' }),
    ApiBody({ schema: { type: 'object', required: ['name', 'city', 'address', 'latitude', 'longitude'],
        properties: {
          code: { type: 'string', maxLength: 20, description: 'Required for manual entries; generated when linked to an external record' },
          name: { type: 'string', maxLength: 100 },
          city: { type: 'string', maxLength: 60 }, address: { type: 'string', maxLength: 150 },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          externalRecordIds: { type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 10 },
        },
      } }),
  ),
};
