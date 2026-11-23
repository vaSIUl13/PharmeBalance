import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

export const drugsDocs = {
  controller: ApiTags('drugs'),
  list: applyDecorators(
    ApiOperation({ summary: 'Search the drug directory by name, SKU or international name' }),
    ApiQuery({ name: 'q', required: false, type: String, description: 'Up to 100 characters' }),
    ApiQuery({ name: 'after', required: false, type: Number, description: 'Cursor from the previous page' }),
  ),
};
