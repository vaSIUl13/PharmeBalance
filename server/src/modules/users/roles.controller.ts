import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/auth.guard';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('roles')
export class RolesController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Permissions('USERS_MANAGE')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List account roles and their data scopes' })
  list() {
    return this.users.roles();
  }
}
