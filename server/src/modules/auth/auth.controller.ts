import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { authDocs } from '../../swagger/path/auth';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { type AuthRequest, Public } from './auth.guard';
import { challengeCookie, cookieValue, minPasswordLength, sessionCookie } from './auth-security';

const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const;

function field(body: unknown, name: string, maximum: number, minimum = 1): string {
  const value = body && typeof body === 'object' ? (body as Record<string, unknown>)[name] : undefined;
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum) {
    throw new BadRequestException('Invalid ' + name);
  }
  return value;
}
function emailField(body: unknown) {
  const email = field(body, 'email', 100).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Invalid email');
  return email;
}
const ip = (req: AuthRequest) => req.ip ?? req.socket.remoteAddress ?? 'unknown';
const device = (req: AuthRequest) => req.get('User-Agent') ?? 'Unknown device';

@authDocs.controller
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @authDocs.login
  @Public()
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(@Body() body: unknown, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(emailField(body), field(body, 'password', 256), ip(req), device(req), cookieValue(req.headers.cookie, sessionCookie));
    if (!result.session) {
      res.cookie(challengeCookie, result.challenge, { ...cookieOptions, maxAge: 300_000 });
      return { mfaRequired: true };
    }
    res.clearCookie(challengeCookie, cookieOptions);
    res.cookie(sessionCookie, result.session.raw, { ...cookieOptions, maxAge: result.session.maxAge });
    return { mfaRequired: false };
  }

  @authDocs.mfa
  @Public()
  @Post('mfa/verify')
  @HttpCode(204)
  async mfa(@Body() body: unknown, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const challenge = cookieValue(req.headers.cookie, challengeCookie);
    if (!challenge) throw new UnauthorizedException('Запит MFA завершився. Увійди знову з email і паролем.');
    const code = field(body, 'code', 22, 6);
    if (!/^(?:\d{6}|[A-Za-z0-9_-]{22})$/.test(code)) throw new BadRequestException('Invalid verification code');
    const session = await this.auth.completeMfa(challenge, code, ip(req), device(req), cookieValue(req.headers.cookie, sessionCookie));
    res.clearCookie(challengeCookie, cookieOptions);
    res.cookie(sessionCookie, session.raw, { ...cookieOptions, maxAge: session.maxAge });
  }

  @authDocs.me
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@Req() req: AuthRequest) {
    return req.principal;
  }

  @authDocs.sessions
  @Get('sessions')
  @Header('Cache-Control', 'no-store')
  async sessions(@Req() req: AuthRequest) {
    return (await this.auth.listSessions(req.principal!)).map((session) => ({
      ...session, current: session.id === req.principal!.sessionId,
    }));
  }

  @authDocs.revoke
  @Delete('sessions/:id')
  @HttpCode(204)
  async revoke(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.principal!, id);
    if (req.principal!.sessionId === id) res.clearCookie(sessionCookie, cookieOptions);
  }

  @authDocs.logout
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.principal!, req.principal!.sessionId);
    res.clearCookie(sessionCookie, cookieOptions);
  }

  @authDocs.logoutAll
  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.principal!);
    res.clearCookie(sessionCookie, cookieOptions);
    res.clearCookie(challengeCookie, cookieOptions);
  }

  @authDocs.change
  @Post('password/change')
  @HttpCode(204)
  async change(@Body() body: unknown, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.changePassword(req.principal!, field(body, 'currentPassword', 256), field(body, 'newPassword', 256, minPasswordLength));
    res.clearCookie(sessionCookie, cookieOptions);
  }

  @authDocs.requestReset
  @Public()
  @Post('password/reset-request')
  @HttpCode(204)
  async requestReset(@Body() body: unknown, @Req() req: AuthRequest) {
    await this.auth.requestReset(emailField(body), ip(req));
  }

  @authDocs.reset
  @Public()
  @Post('password/reset')
  @HttpCode(204)
  async reset(@Body() body: unknown, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const raw = field(body, 'token', 43, 43);
    if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new BadRequestException('Invalid token');
    await this.auth.completeReset(raw, field(body, 'newPassword', 256, minPasswordLength), ip(req));
    res.clearCookie(sessionCookie, cookieOptions);
  }
}
