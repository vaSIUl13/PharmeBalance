import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthRedisService } from '../auth/auth-redis.service';
import { hashPassword } from '../auth/auth-security';
import type { Principal } from '../auth/auth.service';
import { EmailService } from '../notifications/email.service';
import { type CreateUserDto, parseAccess, parseCreate, registrationPasswordMinLength } from './dto/user-input';
import { lockUser } from './pharmacy-assignments';
import { UsersService } from './users.service';

const safeFields = {
  id: true, firstName: true, lastName: true, email: true, login: true,
  requestedRole: true, createdAt: true, decidedAt: true, approved: true,
} satisfies Prisma.RegistrationRequestSelect;

function reviewerEmail() {
  return process.env.REGISTRATION_REVIEWER_EMAIL?.trim().toLowerCase();
}

function requireReviewer(actor: Principal) {
  if (actor.role !== 'admin' || actor.email !== reviewerEmail() || !actor.permissions.includes('USERS_MANAGE')) {
    throw new ForbiddenException();
  }
}

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly redis: AuthRedisService,
    private readonly users: UsersService,
    private readonly email: EmailService,
  ) {}

  async submit(body: unknown, ip: string) {
    const reviewer = reviewerEmail();
    if (!reviewer) throw new ServiceUnavailableException('Registration is unavailable');
    await this.redis.limit('registration:ip', ip, 8, 3600);
    if (!body || typeof body !== 'object' || !('consent' in body) || body.consent !== true) {
      throw new BadRequestException('Consent is required');
    }
    const { password, pharmacyId, role, ...profile } = parseCreate(body, registrationPasswordMinLength);
    if (pharmacyId !== undefined || !/^[a-zA-Z0-9.]{4,50}$/.test(profile.login) ||
        !/\p{L}/u.test(password) || !/\d/.test(password)) {
      throw new BadRequestException('Invalid registration details');
    }
    if ([profile.firstName, profile.lastName, profile.email].some(value => /[\u0000\uD800-\uDFFF]/u.test(value))) {
      throw new BadRequestException('Invalid registration details');
    }
    profile.login = profile.login.toLowerCase();
    await this.redis.limit('registration:email', profile.email, 3, 3600);
    const availableReviewer = await this.db.userAccount.findFirst({
      where: { email: reviewer, isActive: true, authMfa: { isNot: null },
        role: { code: 'admin', rolePermissionRows: { some: { permission: { code: 'USERS_MANAGE' } } } } },
      select: { userId: true },
    });
    if (!availableReviewer) throw new ServiceUnavailableException('Registration is unavailable');
    const existing = await this.db.userAccount.findFirst({
      where: { OR: [{ email: profile.email }, { login: profile.login }] }, select: { userId: true },
    });
    if (existing) return;
    const passwordHash = await hashPassword(password);
    try {
      const { id } = await this.db.registrationRequest.create({
        data: { ...profile, requestedRole: role, passwordHash }, select: { id: true },
      });
      if (this.email.enabled) void this.notify(reviewer, id).catch(() => this.logger.warn('Registration notification failed'));
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }

  private async notify(to: string, id: string) {
    const origin = process.env.AUTH_ORIGIN ?? 'http://localhost:3000';
    const url = new URL('/admin/registration-requests', origin);
    url.searchParams.set('id', id);
    const approve = new URL(url);
    const reject = new URL(url);
    approve.searchParams.set('decision', 'approve');
    reject.searchParams.set('decision', 'reject');
    const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    await this.email.sendRegistrationNotice(to, {
      subject: 'PharmaBalance: нова заявка на реєстрацію',
      text: 'Approve: ' + approve.href + '\nReject: ' + reject.href,
      html: '<p>Перегляньте заявку та підтвердьте рішення в кабінеті.</p><p><a href="' +
        escape(approve.href) + '">Approve</a> · <a href="' + escape(reject.href) + '">Reject</a></p>',
    });
  }

  async read(actor: Principal, id?: string) {
    requireReviewer(actor);
    if (!id) return this.db.registrationRequest.findMany({
      where: { decidedAt: null }, select: safeFields, take: 50, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const request = await this.db.registrationRequest.findUnique({ where: { id }, select: safeFields });
    if (!request) throw new NotFoundException();
    return request;
  }

  async decide(actor: Principal, id: string, approved: boolean, body?: unknown) {
    requireReviewer(actor);
    const pharmacyId = approved && body && typeof body === 'object' && 'pharmacyId' in body
      ? parseAccess({ pharmacyId: body.pharmacyId }).pharmacyId : undefined;
    try {
      await this.db.$transaction(async tx => {
        await lockUser(tx, actor.userId);
        const reviewer = await tx.userAccount.findFirst({
          where: { userId: actor.userId, email: reviewerEmail(), isActive: true,
            role: { code: 'admin', rolePermissionRows: { some: { permission: { code: 'USERS_MANAGE' } } } } },
          select: { userId: true },
        });
        if (!reviewer) throw new ForbiddenException();
        await tx.$queryRaw`SELECT id FROM registration_request WHERE id = ${id}::uuid FOR UPDATE`;
        const request = await tx.registrationRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException();
        if (request.decidedAt) {
          if (request.approved !== approved) throw new ConflictException('Registration has already been resolved');
          return;
        }
        if (approved) {
          const { firstName, lastName, login, email, requestedRole, passwordHash } = request;
          if (!passwordHash) throw new ConflictException('Registration credentials are unavailable');
          const { role } = parseAccess({ role: requestedRole });
          if (!role) throw new BadRequestException('Invalid requested role');
          const profile: Omit<CreateUserDto, 'password'> = { firstName, lastName, login, email, role, pharmacyId };
          await this.users.createWithHash(tx, actor.userId, profile, passwordHash);
        }
        await tx.registrationRequest.update({
          where: { id }, data: { approved, decidedAt: new Date(), passwordHash: null },
        });
        await tx.authAuditEvent.create({
          data: { userId: actor.userId, event: approved ? 'REGISTRATION_APPROVED' : 'REGISTRATION_REJECTED' },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Login or email already exists');
      }
      throw error;
    }
  }
}
