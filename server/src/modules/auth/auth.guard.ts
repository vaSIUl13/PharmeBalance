import { applyDecorators, CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService, type Principal } from './auth.service';
import { cookieValue, sessionCookie } from './auth-security';

export type AuthRequest = Request & { principal?: Principal };
export const Public = (): MethodDecorator => applyDecorators(SetMetadata('auth:public', true), ApiOperation({ security: [] }));
export const Permissions = (...codes: string[]) => SetMetadata('auth:permissions', codes);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const expected = process.env.AUTH_ORIGIN ?? 'http://localhost:3000';
      if (request.get('Origin') !== expected || request.get('X-Pharme-CSRF') !== '1') {
        throw new ForbiddenException('Invalid request origin or CSRF header');
      }
    }

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('auth:public', targets)) return true;
    const raw = cookieValue(request.headers.cookie, sessionCookie);
    if (!raw) throw new UnauthorizedException();
    request.principal = await this.auth.authenticate(raw);
    const permissions = this.reflector.getAllAndMerge<string[]>('auth:permissions', targets) ?? [];
    if (!permissions.every((code) => request.principal!.permissions.includes(code))) {
      throw new ForbiddenException();
    }
    return true;
  }
}
