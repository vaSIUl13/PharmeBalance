import { Controller, Get, Header, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import type { AuthRequest } from '../auth/auth.guard';
import { pharmacyScope } from '../auth/auth-scope';

@ApiTags('stocks')
@Controller('stocks')
export class StocksController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthRequest) {
    return this.db.stockItem.findMany({
      where: { pharmacy: pharmacyScope(req.principal!) },
      take: 100,
      orderBy: { stockId: 'asc' },
    });
  }
}
