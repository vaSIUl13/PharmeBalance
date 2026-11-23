import { Controller, Get, Header } from '@nestjs/common';
import { rolesDocs } from '../../swagger/path/roles';
import { Permissions } from '../auth/auth.guard';
import { UsersService } from './users.service';

@rolesDocs.controller
@Controller('roles')
export class RolesController {
  constructor(private readonly users: UsersService) {}

  @rolesDocs.list
  @Get()
  @Permissions('USERS_MANAGE')
  @Header('Cache-Control', 'no-store')
  list() {
    return this.users.roles();
  }
}
