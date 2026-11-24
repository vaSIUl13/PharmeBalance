import { Controller, Get, Header, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { optionalQueryId } from '../../common/query-id';
import { inboxDocs } from '../../swagger/path/inbox';
import type { AuthRequest } from '../auth/auth.guard';
import { InboxService } from './inbox.service';

@inboxDocs.controller
@Controller('notifications/inbox')
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @inboxDocs.list
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthRequest, @Query('before') before?: string) {
    return this.inbox.list(req.principal!, optionalQueryId(before, 'before'));
  }

  @inboxDocs.readAll
  @Post('read-through/:id')
  @HttpCode(204)
  markAllRead(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.inbox.markAllRead(req.principal!, optionalQueryId(id, 'id')!);
  }

  @inboxDocs.read
  @Post(':id/read')
  @HttpCode(204)
  markRead(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.inbox.markRead(req.principal!, optionalQueryId(id, 'id')!);
  }
}
