import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Param, Put, Req } from '@nestjs/common';
import { rolesDocs } from '../../swagger/path/roles';
import type { AuthRequest } from '../auth/auth.guard';
import { isAdministrativeRole } from '../auth/administrative-role';
import { RolePermissionsService } from './role-permissions.service';
import { UsersService } from './users.service';

@rolesDocs.controller
@Controller('roles')
export class RolesController {
  constructor(private readonly users: UsersService, private readonly permissions: RolePermissionsService) {}

  @rolesDocs.list
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthRequest) {
    if (!isAdministrativeRole(req.principal?.role)) throw new ForbiddenException();
    return this.users.roles();
  }

  @rolesDocs.catalog
  @Get('permissions')
  @Header('Cache-Control', 'no-store')
  catalog(@Req() req: AuthRequest) {
    return this.permissions.catalog(req.principal!);
  }

  @rolesDocs.set
  @Put(':role/permissions/:permission')
  set(@Req() req: AuthRequest, @Param('role') role: string, @Param('permission') permission: string, @Body() body: unknown) {
    if (!/^[a-z]{1,20}$/.test(role) || !/^[A-Z][A-Z0-9_]{0,29}$/.test(permission) ||
        !body || typeof body !== 'object' || !('granted' in body) || typeof body.granted !== 'boolean') {
      throw new BadRequestException('Invalid role, permission or granted value');
    }
    return this.permissions.set(req.principal!, role, permission, body.granted);
  }
}
