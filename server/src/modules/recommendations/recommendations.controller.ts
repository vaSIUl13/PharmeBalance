import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { recommendationsDocs } from '../../swagger/path/recommendations';
import { type AuthRequest, Permissions } from '../auth/auth.guard';
import { optionalQueryId } from '../../common/query-id';
import { commands, RecommendationsService } from './recommendations.service';
import { parseTransferInput } from './transfer-input';

@recommendationsDocs.controller
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @recommendationsDocs.list
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthRequest, @Query('after') after?: string) {
    return this.recommendations.list(req.principal!, optionalQueryId(after, 'after'));
  }

  @recommendationsDocs.detail
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.recommendations.detail(req.principal!, optionalQueryId(id, 'id')!);
  }

  @recommendationsDocs.route
  @Get(':id/route')
  @Header('Cache-Control', 'no-store')
  route(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.recommendations.route(req.principal!, optionalQueryId(id, 'id')!);
  }

  @recommendationsDocs.history
  @Get(':id/history')
  @Header('Cache-Control', 'no-store')
  history(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.recommendations.history(req.principal!, optionalQueryId(id, 'id')!);
  }

  @recommendationsDocs.generate
  @Post('generate/:runId')
  @Permissions('NETWORK_VIEW')
  @HttpCode(200)
  generate(@Req() req: AuthRequest, @Param('runId') runId: string) {
    return this.recommendations.generate(req.principal!, optionalQueryId(runId, 'runId')!);
  }

  @recommendationsDocs.act
  @Post(':id/actions/:command')
  @HttpCode(200)
  act(@Req() req: AuthRequest, @Param('id') id: string, @Param('command') value: string, @Body() body: unknown) {
    const command = commands.find(code => code === value);
    if (!command) throw new BadRequestException('Unknown transfer action');
    const { quantity, comment } = parseTransferInput(body);
    if (quantity !== undefined && command !== 'RECEIVE') throw new BadRequestException('Quantity is only accepted for RECEIVE');
    return this.recommendations.act(req.principal!, optionalQueryId(id, 'id')!, command, quantity, comment);
  }
}
