import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { type AuthRequest, Permissions } from '../auth/auth.guard';
import { optionalQueryId } from '../../common/query-id';
import { commands, RecommendationsService } from './recommendations.service';
import { parseTransferInput, TransferInput } from './transfer-input';

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'after', required: false, type: Number, description: 'Last recommendation ID of the previous page' })
  list(@Req() req: AuthRequest, @Query('after') after?: string) {
    return this.recommendations.list(req.principal!, optionalQueryId(after, 'after'));
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Recommendation with endpoints, donor distance and uncovered quantity' })
  detail(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.recommendations.detail(req.principal!, optionalQueryId(id, 'id')!);
  }

  @Get(':id/history')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List transfer actions, actors, quantities and status transitions' })
  history(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.recommendations.history(req.principal!, optionalQueryId(id, 'id')!);
  }

  @Post('generate/:runId')
  @Permissions('NETWORK_VIEW')
  @HttpCode(200)
  @ApiOperation({ summary: 'Evaluate shortage positions in a forecast run once' })
  generate(@Req() req: AuthRequest, @Param('runId') runId: string) {
    return this.recommendations.generate(req.principal!, optionalQueryId(runId, 'runId')!);
  }

  @Post(':id/actions/:command')
  @HttpCode(200)
  @ApiOperation({ summary: 'Apply a transfer action idempotently', description: 'CONFIRM reserves; DISPATCH preserves the reservation; RECEIVE moves both physical balances.' })
  @ApiParam({ name: 'command', enum: [...commands] })
  @ApiBody({ type: TransferInput, required: false })
  @ApiConflictResponse({ description: 'Invalid transition, stale suggestion, or unavailable reservation' })
  act(@Req() req: AuthRequest, @Param('id') id: string, @Param('command') value: string, @Body() body: unknown) {
    const command = commands.find(code => code === value);
    if (!command) throw new BadRequestException('Unknown transfer action');
    const { quantity, comment } = parseTransferInput(body);
    if (quantity !== undefined && command !== 'RECEIVE') throw new BadRequestException('Quantity is only accepted for RECEIVE');
    return this.recommendations.act(req.principal!, optionalQueryId(id, 'id')!, command, quantity, comment);
  }
}
