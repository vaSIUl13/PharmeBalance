import { applyDecorators } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

export const drugsDocs = {
  controller: ApiTags('drugs'),
  list: applyDecorators(
    ApiOperation({ summary: 'Search the drug directory by name, SKU or international name' }),
    ApiQuery({ name: 'q', required: false, type: String, description: 'Up to 100 characters' }),
    ApiQuery({ name: 'after', required: false, type: Number, description: 'Cursor from the previous page' }),
  ),
  create: applyDecorators(
    ApiOperation({ summary: 'Create a local network SKU without a regulatory registration link' }),
    ApiBody({ schema: { type: 'object', additionalProperties: false, required: ['sku', 'name', 'dosageForm', 'unit'],
      properties: {
        sku: { type: 'string', maxLength: 30 }, name: { type: 'string', maxLength: 120 },
        dosageForm: { type: 'string', maxLength: 40 }, strength: { type: 'string', maxLength: 40, nullable: true },
        unit: { type: 'string', maxLength: 20 },
      } } }),
    ApiBadRequestResponse(), ApiForbiddenResponse(), ApiConflictResponse({ description: 'SKU already exists' }),
  ),
  update: applyDecorators(
    ApiOperation({ summary: 'Update the name without changing the SKU, package or registration' }),
    ApiBody({ schema: { type: 'object', additionalProperties: false, required: ['name'],
      properties: { name: { type: 'string', maxLength: 120 } } } }),
    ApiBadRequestResponse(), ApiForbiddenResponse(), ApiNotFoundResponse(),
  ),
};
