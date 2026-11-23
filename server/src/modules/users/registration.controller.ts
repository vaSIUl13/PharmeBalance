import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { registrationDocs } from '../../swagger/path/registration';
import { Public, Permissions, type AuthRequest } from '../auth/auth.guard';
import { RegistrationService } from './registration.service';

@registrationDocs.controller
@Controller('registration-requests')
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  @registrationDocs.submit
  @Public()
  @Post()
  @HttpCode(202)
  async submit(@Req() req: AuthRequest, @Body() body: unknown) {
    await this.registration.submit(body, req.ip ?? req.socket.remoteAddress ?? 'unknown');
  }

  @registrationDocs.pending
  @Permissions('USERS_MANAGE')
  @Get()
  @Header('Cache-Control', 'no-store')
  pending(@Req() req: AuthRequest) {
    return this.registration.read(req.principal!);
  }

  @registrationDocs.detail
  @Permissions('USERS_MANAGE')
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.registration.read(req.principal!, id);
  }

  @registrationDocs.approve
  @registrationDocs.approval
  @Permissions('USERS_MANAGE')
  @Post(':id/approve')
  @HttpCode(204)
  approve(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.registration.decide(req.principal!, id, true, body);
  }

  @registrationDocs.reject
  @Permissions('USERS_MANAGE')
  @Post(':id/reject')
  @HttpCode(204)
  reject(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.registration.decide(req.principal!, id, false);
  }
}
