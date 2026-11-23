import { applyDecorators } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CreateStockDto, StockThresholdsDto } from '../../modules/stocks/dto/stock-input';

export const stocksDocs = {
  controller: ApiTags('stocks'),
  current: applyDecorators(
    ApiQuery({ name: 'after', required: false, type: Number, description: 'Last stockId of the preceding page' }),
    ApiOperation({ summary: 'Read current inventory and latest forecast for the pharmacy assigned to the head' }),
  ),
  list: applyDecorators(
    ApiQuery({ name: 'sku', required: false, type: String }),
    ApiQuery({ name: 'pharmacyId', required: false, type: Number }),
    ApiQuery({ name: 'after', required: false, type: Number, description: 'Last stockId of the preceding page' }),
    ApiOperation({ summary: 'List up to 100 visible stock items, ordered by stockId' }),
  ),
  create: applyDecorators(
    ApiNotFoundResponse({ description: 'Unknown SKU or unavailable pharmacy' }),
    ApiConflictResponse({ description: 'This pharmacy already has a stock item for the SKU' }),
    ApiBadRequestResponse({ description: 'Expected whole units and 0 ≤ MSL ≤ Max' }),
    ApiBody({ type: CreateStockDto }),
    ApiOperation({ summary: 'Create a stock item for a managed pharmacy and an existing SKU' }),
  ),
  updateThresholds: applyDecorators(
    ApiNotFoundResponse({ description: 'Stock item unavailable' }),
    ApiBadRequestResponse({ description: 'Provide at least one threshold and maintain 0 ≤ MSL ≤ Max' }),
    ApiBody({ type: StockThresholdsDto }),
    ApiOperation({ summary: 'Set MSL, Max or both. Omitted thresholds retain their current values.' }),
  ),
};
