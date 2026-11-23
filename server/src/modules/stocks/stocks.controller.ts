import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { stocksDocs } from '../../swagger/path/stocks';
import { optionalQueryId } from '../../common/query-id';
import { type AuthRequest, Permissions } from '../auth/auth.guard';
import { createStockInput, stockSku, stockThresholdsInput } from './dto/stock-input';
import { StocksService } from './stocks.service';

@stocksDocs.controller
@Controller('stocks')
export class StocksController {
  constructor(private readonly stocks: StocksService) {}

  @stocksDocs.list
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthRequest, @Query('after') after?: string, @Query('pharmacyId') pharmacy?: string, @Query('sku') sku?: string) {
    return this.stocks.list(req.principal!, optionalQueryId(after, 'after'), optionalQueryId(pharmacy, 'pharmacyId'),
      sku === undefined ? undefined : stockSku(sku));
  }

  @stocksDocs.current
  @Get('current')
  @Permissions('PHARMACY_VIEW')
  @Header('Cache-Control', 'no-store')
  current(@Req() req: AuthRequest, @Query('after') after?: string) {
    return this.stocks.currentPositions(req.principal!, optionalQueryId(after, 'after'));
  }

  @stocksDocs.create
  @Post()
  @Permissions('THRESHOLDS_EDIT')
  create(@Req() req: AuthRequest, @Body() input: unknown) {
    return this.stocks.create(req.principal!, createStockInput(input));
  }

  @stocksDocs.updateThresholds
  @Patch(':id/thresholds')
  @Permissions('THRESHOLDS_EDIT')
  updateThresholds(@Req() req: AuthRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.stocks.updateThresholds(req.principal!, optionalQueryId(id, 'stockId')!, stockThresholdsInput(input));
  }
}
