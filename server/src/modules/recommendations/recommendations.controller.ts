import { Controller, Get, Header, NotFoundException, Param, ParseIntPipe, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import type { AuthRequest } from '../auth/auth.guard';
import { transferScope } from '../auth/auth-scope';

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthRequest) {
    return this.db.recommendation.findMany({
      where: transferScope(req.principal!),
      take: 100,
      orderBy: { recommendationId: 'desc' },
    });
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async detail(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    const recommendation = await this.db.recommendation.findFirst({
      where: { AND: [{ recommendationId: id }, transferScope(req.principal!)] },
    });
    if (!recommendation) throw new NotFoundException();
    return recommendation;
  }
}
