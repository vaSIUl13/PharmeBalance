import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { optionalQueryId } from '../../common/query-id';
import { type AuthRequest, Permissions } from '../auth/auth.guard';
import { CreateStockDto, createStockInput, stockSku, StockThresholdsDto, stockThresholdsInput } from './dto/stock-input';
import { StocksService } from './stocks.service';

@ApiTags('stocks')
@Controller('stocks')
export class StocksController {
  constructor(private readonly stocks: StocksService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List up to 100 visible stock items, ordered by stockId' })
  @ApiQuery({ name: 'after', required: false, type: Number, description: 'Last stockId of the preceding page' })
  @ApiQuery({ name: 'pharmacyId', required: false, type: Number })
  @ApiQuery({ name: 'sku', required: false, type: String })
  list(@Req() req: AuthRequest, @Query('after') after?: string, @Query('pharmacyId') pharmacy?: string, @Query('sku') sku?: string) {
    return this.stocks.list(req.principal!, optionalQueryId(after, 'after'), optionalQueryId(pharmacy, 'pharmacyId'),
      sku === undefined ? undefined : stockSku(sku));
  }

  @Post()
  @Permissions('THRESHOLDS_EDIT')
  @ApiOperation({ summary: 'Create a stock item for a managed pharmacy and an existing SKU' })
  @ApiBody({ type: CreateStockDto })
  @ApiBadRequestResponse({ description: 'Expected whole units and 0 ≤ MSL ≤ Max' })
  @ApiConflictResponse({ description: 'This pharmacy already has a stock item for the SKU' })
  @ApiNotFoundResponse({ description: 'Unknown SKU or unavailable pharmacy' })
  create(@Req() req: AuthRequest, @Body() input: unknown) {
    return this.stocks.create(req.principal!, createStockInput(input));
  }

  @Patch(':id/thresholds')
  @Permissions('THRESHOLDS_EDIT')
  @ApiOperation({ summary: 'Set MSL, Max or both. Omitted thresholds retain their current values.' })
  @ApiBody({ type: StockThresholdsDto })
  @ApiBadRequestResponse({ description: 'Provide at least one threshold and maintain 0 ≤ MSL ≤ Max' })
  @ApiNotFoundResponse({ description: 'Stock item unavailable' })
  updateThresholds(@Req() req: AuthRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.stocks.updateThresholds(req.principal!, optionalQueryId(id, 'stockId')!, stockThresholdsInput(input));
  }
}
