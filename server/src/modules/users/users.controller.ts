import { Controller, HttpCode, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type AuthRequest, Permissions } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly auth: AuthService) {}

  @Post(':id/block')
  @Permissions('USERS_MANAGE')
  @HttpCode(204)
  async block(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    await this.auth.setBlocked(req.principal!, id);
  }
}
