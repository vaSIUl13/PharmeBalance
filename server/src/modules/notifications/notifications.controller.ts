import { Controller, ForbiddenException, Get, Header, HttpCode, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { notificationsDocs } from '../../swagger/path/notifications';
import { optionalQueryId } from '../../common/query-id';
import { type AuthRequest, Permissions } from '../auth/auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from './notifications.service';

@notificationsDocs.controller
@Permissions('USERS_MANAGE')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService, private readonly db: PrismaService) {}

  @notificationsDocs.failed
  @Get('failed')
  @Header('Cache-Control', 'no-store')
  failed(@Req() req: AuthRequest, @Query('after') after?: string) {
    if (req.principal?.role !== 'admin') throw new ForbiddenException();
    return this.db.emailDelivery.findMany({ where: { failedAt: { not: null }, id: { gt: optionalQueryId(after, 'after') ?? 0 } },
      select: { id: true, actionId: true, attempts: true, failedAt: true, lastError: true },
      orderBy: { id: 'asc' }, take: 50 });
  }

  @notificationsDocs.retry
  @Post('failed/:id/retry')
  @HttpCode(204)
  async retry(@Req() req: AuthRequest, @Param('id') id: string) {
    if (req.principal?.role !== 'admin') throw new ForbiddenException();
    if (!await this.notifications.retryFailed(optionalQueryId(id, 'id')!)) throw new NotFoundException();
  }
}
