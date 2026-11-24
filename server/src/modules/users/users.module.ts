import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RolesController } from './roles.controller';
import { RolePermissionsService } from './role-permissions.service';

import { NotificationsModule } from '../notifications/notifications.module';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';

@Module({
  imports: [NotificationsModule],
  controllers: [UsersController, RolesController, RegistrationController],
  providers: [UsersService, RegistrationService, RolePermissionsService],
})
export class UsersModule {}
