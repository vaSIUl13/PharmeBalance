import { Body, Controller, Get, Header, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { optionalQueryId } from '../../common/query-id';
import { CreateUserDto, parseAccess, parseCreate, UserAccessDto } from './dto/user-input';
import { UsersService } from './users.service';
import { type AuthRequest, Permissions } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly auth: AuthService, private readonly users: UsersService) {}

  @Get()
  @Permissions('USERS_MANAGE')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List accounts, roles and current pharmacy assignments' })
  @ApiQuery({ name: 'after', required: false, type: Number, description: 'Pass next from the previous page' })
  list(@Query('after') after?: string) {
    return this.users.list(optionalQueryId(after, 'after'));
  }

  @Post()
  @Permissions('USERS_MANAGE')
  @ApiOperation({ summary: 'Create an account with a role. A head requires a managed pharmacy ID.' })
  @ApiBody({ type: CreateUserDto })
  create(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.users.create(req.principal!.userId, parseCreate(body));
  }

  @Patch(':id')
  @Permissions('USERS_MANAGE')
  @ApiOperation({ summary: 'Change role or assign a pharmacy. Assigning a head activates the pharmacy.' })
  @ApiBody({ type: UserAccessDto })
  update(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.users.update(req.principal!.userId, id, parseAccess(body));
  }

  @Post(':id/block')
  @Permissions('USERS_MANAGE')
  @HttpCode(204)
  async block(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    await this.auth.setBlocked(req.principal!, id);
  }
}
