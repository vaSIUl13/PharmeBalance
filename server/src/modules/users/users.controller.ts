import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { usersDocs } from '../../swagger/path/users';
import { DatabaseIdPipe, optionalQueryId } from '../../common/query-id';
import { parseAccess, parseCreate } from './dto/user-input';
import { UsersService } from './users.service';
import { type AuthRequest, Permissions } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';

@usersDocs.controller
@Controller('users')
export class UsersController {
  constructor(private readonly auth: AuthService, private readonly users: UsersService) {}

  @usersDocs.list
  @Get()
  @Permissions('USERS_MANAGE')
  @Header('Cache-Control', 'no-store')
  list(@Query('after') after?: string) {
    return this.users.list(optionalQueryId(after, 'after'));
  }

  @usersDocs.create
  @Post()
  @Permissions('USERS_MANAGE')
  create(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.users.create(req.principal!.userId, parseCreate(body));
  }

  @usersDocs.update
  @Patch(':id')
  @Permissions('USERS_MANAGE')
  update(@Req() req: AuthRequest, @Param('id', DatabaseIdPipe) id: number, @Body() body: unknown) {
    return this.users.update(req.principal!.userId, id, parseAccess(body));
  }

  @usersDocs.block
  @Post(':id/block')
  @Permissions('USERS_MANAGE')
  @HttpCode(204)
  async block(@Req() req: AuthRequest, @Param('id', DatabaseIdPipe) id: number) {
    await this.auth.setBlocked(req.principal!, id);
  }
}
