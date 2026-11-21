import { ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { authenticator } from 'otplib';
import { createTransport } from 'nodemailer';
import { PrismaService } from '../../database/prisma.service';
import { AuthRedisService } from './auth-redis.service';
import { currentHashPrefix, decryptMfa, digest, hashPassword, token, verifyPassword } from './auth-security';

const minute = 60_000;
const hour = 60 * minute;
const absoluteLifetime = 30 * 24 * hour;
const adminLifetime = 24 * hour;
const adminIdle = 30 * minute;
const idle = 12 * hour;
const accessRelations = {
  role: { include: { rolePermissionRows: { include: { permission: true } } } },
  userPharmacyRows: { where: { unassignedAt: null }, select: { pharmacyId: true } },
} satisfies Prisma.UserAccountInclude;

export interface Principal {
  sessionId: string;
  userId: number;
  email: string;
  role: string;
  permissions: string[];
  pharmacyIds: number[];
}

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash?: Promise<string>;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private readonly db: PrismaService, private readonly redis: AuthRedisService) {}

  onModuleInit() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(() => this.logger.warn('Authentication cleanup failed'));
    }, hour).unref();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  async authenticate(raw: string): Promise<Principal> {
    const hash = digest(raw);
    if (await this.redis.isRevoked(hash)) throw new UnauthorizedException();
    const session = await this.db.authSession.findUnique({
      where: { tokenHash: hash },
      include: { user: { include: accessRelations } },
    });
    if (!session || session.revokedAt || !session.user.isActive) throw new UnauthorizedException();
    const isAdmin = session.user.role.code === 'admin';
    const now = Date.now();
    if (session.expiresAt.getTime() <= now ||
        now - session.lastSeenAt.getTime() >= (isAdmin ? adminIdle : idle) ||
        (isAdmin && (!session.mfaVerified || now - session.createdAt.getTime() >= adminLifetime))) {
      throw new UnauthorizedException();
    }
    if (now - session.lastSeenAt.getTime() >= minute) {
      await this.db.authSession.updateMany({
        where: { id: session.id, revokedAt: null, lastSeenAt: session.lastSeenAt },
        data: { lastSeenAt: new Date(now) },
      });
    }
    const user = session.user;
    return {
      sessionId: session.id,
      userId: user.userId,
      email: user.email,
      role: user.role.code,
      permissions: user.role.rolePermissionRows.map((row) => row.permission.code),
      pharmacyIds: user.userPharmacyRows.map((row) => row.pharmacyId),
    };
  }

  private async lockUser(tx: Prisma.TransactionClient, id: number) {
    await tx.$queryRaw`SELECT user_id FROM user_account WHERE user_id = ${id} FOR UPDATE`;
  }

  private audit(tx: Prisma.TransactionClient, event: string, userId?: number) {
    return tx.authAuditEvent.create({ data: { event, userId } });
  }

  private async issue(tx: Prisma.TransactionClient, userId: number, mfaVerified: boolean, device: string, previous?: string) {
    if (previous) {
      await tx.authSession.updateMany({
        where: { userId, tokenHash: digest(previous), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    const raw = token();
    const maxAge = mfaVerified ? adminLifetime : absoluteLifetime;
    await tx.authSession.create({
      data: {
        tokenHash: digest(raw), userId, mfaVerified, device: device.slice(0, 255),
        expiresAt: new Date(Date.now() + maxAge),
      },
    });
    await this.audit(tx, 'LOGIN_SUCCESS', userId);
    return { raw, maxAge };
  }

  async login(email: string, password: string, ip: string, device: string, previous?: string) {
    await this.redis.limit('login:ip', ip, 30, 900);
    await this.redis.limit('login:account', email, 8, 900);
    const account = await this.db.userAccount.findUnique({ where: { email } });
    this.dummyHash ??= hashPassword(token()).catch((error: unknown) => {
      this.dummyHash = undefined;
      throw error;
    });
    const valid = await verifyPassword(password, account?.passwordHash ?? await this.dummyHash);
    if (!account || !account.isActive || !valid) {
      await this.audit(this.db, 'LOGIN_DENIED', account?.userId);
      throw new UnauthorizedException('Invalid credentials');
    }
    const replacement = account.passwordHash.startsWith(currentHashPrefix) ? undefined : await hashPassword(password);
    return this.db.$transaction(async (tx) => {
      await this.lockUser(tx, account.userId);
      const live = await tx.userAccount.findUnique({
        where: { userId: account.userId }, include: { role: true, authMfa: true },
      });
      if (!live?.isActive || live.passwordHash !== account.passwordHash) throw new UnauthorizedException();
      if (replacement) await tx.userAccount.update({ where: { userId: account.userId }, data: { passwordHash: replacement } });
      if (live.role.code !== 'admin') return { session: await this.issue(tx, live.userId, false, device, previous) } as const;
      if (!live.authMfa) throw new ForbiddenException('Administrator MFA enrollment required');
      const challenge = token();
      await tx.authChallenge.deleteMany({ where: { userId: live.userId, purpose: 'MFA' } });
      await tx.authChallenge.create({ data: {
        tokenHash: digest(challenge), userId: live.userId, purpose: 'MFA', expiresAt: new Date(Date.now() + 5 * minute),
      } });
      return { challenge } as const;
    });
  }

  async completeMfa(challenge: string, code: string, ip: string, device: string, previous?: string) {
    const hash = digest(challenge);
    await this.redis.limit('mfa:ip', ip, 20, 300);
    await this.redis.limit('mfa:challenge', hash, 5, 300);
    const pending = await this.db.authChallenge.findUnique({ where: { tokenHash: hash } });
    if (!pending || pending.purpose !== 'MFA' || pending.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Запит MFA завершився. Увійди знову з email і паролем.');
    }
    const result = await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, pending.userId);
      const live = await tx.authChallenge.findUnique({
        where: { tokenHash: hash }, include: { user: { include: { authMfa: true, role: true } } },
      });
      const credentials = live?.user.authMfa;
      if (!live || !credentials || !live.user.isActive || live.user.role.code !== 'admin' ||
          live.expiresAt.getTime() <= Date.now()) return null;

      if (code.length === 22) {
        const recoveryHash = digest(code);
        if (!credentials.recoveryHashes.includes(recoveryHash)) {
          await this.audit(tx, 'MFA_DENIED', live.userId);
          return null;
        }
        await tx.authMfa.update({
          where: { userId: live.userId },
          data: { recoveryHashes: credentials.recoveryHashes.filter((hash) => hash !== recoveryHash) },
        });
        await this.audit(tx, 'MFA_RECOVERY_USED', live.userId);
      } else {
        const epoch = Date.now();
        const otp = authenticator.clone({ epoch, window: [1, 1] });
        const delta = otp.checkDelta(code, decryptMfa(credentials.encryptedSecret, live.userId));
        const step = delta === null ? null : BigInt(Math.floor(epoch / 30_000) + delta);
        if (step === null || step <= credentials.lastStep) {
          await this.audit(tx, 'MFA_DENIED', live.userId);
          return null;
        }
        await tx.authMfa.update({ where: { userId: live.userId }, data: { lastStep: step } });
      }
      await tx.authChallenge.delete({ where: { tokenHash: hash } });
      return this.issue(tx, live.userId, true, device, previous);
    });
    if (!result) throw new UnauthorizedException('Invalid or expired verification code');
    return result;
  }

  listSessions(principal: Principal) {
    const now = new Date();
    return this.db.authSession.findMany({
      where: {
        userId: principal.userId, revokedAt: null, expiresAt: { gt: now },
        lastSeenAt: { gt: new Date(now.getTime() - (principal.role === 'admin' ? adminIdle : idle)) },
        ...(principal.role === 'admin' ? {
          mfaVerified: true, createdAt: { gt: new Date(now.getTime() - adminLifetime) },
        } : {}),
      },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, device: true, createdAt: true, lastSeenAt: true, expiresAt: true },
    });
  }

  private async revoke(tx: Prisma.TransactionClient, userId: number, id?: string) {
    const sessions = await tx.authSession.updateManyAndReturn({
      where: { userId, id, revokedAt: null }, data: { revokedAt: new Date() }, select: { tokenHash: true },
    });
    return sessions.map((session) => session.tokenHash);
  }

  async logout(principal: Principal, id?: string) {
    const hashes = await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, principal.userId);
      const revoked = await this.revoke(tx, principal.userId, id);
      if (!id) await tx.authChallenge.deleteMany({ where: { userId: principal.userId, purpose: 'MFA' } });
      await this.audit(tx, id ? 'LOGOUT' : 'LOGOUT_ALL', principal.userId);
      return revoked;
    });
    await this.redis.rememberRevoked(hashes);
  }

  async setBlocked(actor: Principal, userId: number) {
    if (actor.userId === userId) throw new ForbiddenException('Cannot block your own account');
    const hashes = await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const user = await tx.userAccount.findUnique({ where: { userId } });
      if (!user) return [];
      await tx.userAccount.update({ where: { userId }, data: { isActive: false } });
      await tx.authChallenge.deleteMany({ where: { userId } });
      const revoked = await this.revoke(tx, userId);
      await this.audit(tx, 'ACCOUNT_BLOCKED', userId);
      await this.audit(tx, 'ACCOUNT_BLOCK_ACTION', actor.userId);
      return revoked;
    });
    await this.redis.rememberRevoked(hashes);
  }

  async changePassword(principal: Principal, current: string, replacement: string) {
    await this.redis.limit('password-change', String(principal.userId), 5, 900);
    const user = await this.db.userAccount.findUniqueOrThrow({ where: { userId: principal.userId } });
    if (!await verifyPassword(current, user.passwordHash)) throw new UnauthorizedException('Invalid credentials');
    const passwordHash = await hashPassword(replacement);
    const hashes = await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, user.userId);
      const changed = await tx.userAccount.updateMany({
        where: { userId: user.userId, passwordHash: user.passwordHash, isActive: true },
        data: { passwordHash },
      });
      if (!changed.count) throw new UnauthorizedException();
      await tx.authChallenge.deleteMany({ where: { userId: user.userId } });
      await this.audit(tx, 'PASSWORD_CHANGED', user.userId);
      return this.revoke(tx, user.userId);
    });
    await this.redis.rememberRevoked(hashes);
  }

  async requestReset(email: string, ip: string) {
    await this.redis.limit('reset:ip', ip, 10, 900);
    await this.redis.limit('reset:email', email, 3, 900);
    // Keep the public response independent of account existence and SMTP timing.
    setImmediate(() => {
      void this.sendReset(email).catch(() => this.logger.warn('Password reset preparation failed'));
    });
  }

  private async sendReset(email: string) {
    const user = await this.db.userAccount.findUnique({ where: { email }, select: { userId: true, isActive: true } });
    const smtp = process.env.AUTH_SMTP_URL;
    const from = process.env.AUTH_MAIL_FROM;
    if (!user?.isActive || !smtp || !from) return;
    const raw = token();
    await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, user.userId);
      await tx.authChallenge.deleteMany({ where: { userId: user.userId, purpose: 'RESET' } });
      await tx.authChallenge.create({ data: {
        userId: user.userId, purpose: 'RESET', tokenHash: digest(raw), expiresAt: new Date(Date.now() + 15 * minute),
      } });
      await this.audit(tx, 'PASSWORD_RESET_REQUESTED', user.userId);
    });
    const url = new URL('/reset-password', process.env.AUTH_ORIGIN ?? 'http://localhost:3000');
    url.hash = 'token=' + raw;
    const delivery = new URL(smtp);
    const secure = delivery.protocol === 'smtps:';
    void createTransport({
      host: delivery.hostname, port: Number(delivery.port || (secure ? 465 : 587)), secure,
      requireTLS: !secure && process.env.NODE_ENV === 'production',
      auth: delivery.username ? {
        user: decodeURIComponent(delivery.username), pass: decodeURIComponent(delivery.password),
      } : undefined,
      connectionTimeout: 5000, socketTimeout: 10000,
    }).sendMail({
      from, to: email, subject: 'PharmeBalance password reset', text: 'Reset your password: ' + url,
    }).catch(() => this.logger.warn('Password reset email delivery failed'));
  }

  async completeReset(raw: string, password: string, ip: string) {
    await this.redis.limit('reset:finish', ip, 10, 900);
    const hash = digest(raw);
    const challenge = await this.db.authChallenge.findUnique({ where: { tokenHash: hash } });
    if (!challenge || challenge.purpose !== 'RESET' || challenge.expiresAt <= new Date()) throw new UnauthorizedException();
    const passwordHash = await hashPassword(password);
    const hashes = await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, challenge.userId);
      const used = await tx.authChallenge.deleteMany({
        where: { tokenHash: hash, purpose: 'RESET', expiresAt: { gt: new Date() } },
      });
      if (!used.count) throw new UnauthorizedException();
      const changed = await tx.userAccount.updateMany({
        where: { userId: challenge.userId, isActive: true }, data: { passwordHash },
      });
      if (!changed.count) throw new UnauthorizedException();
      await tx.authChallenge.deleteMany({ where: { userId: challenge.userId } });
      await this.audit(tx, 'PASSWORD_RESET', challenge.userId);
      return this.revoke(tx, challenge.userId);
    });
    await this.redis.rememberRevoked(hashes);
  }

  private async cleanup() {
    await this.db.$executeRaw`DELETE FROM auth_challenge WHERE token_hash IN
      (SELECT token_hash FROM auth_challenge WHERE expires_at <= now() LIMIT 1000 FOR UPDATE SKIP LOCKED)`;
    await this.db.$executeRaw`DELETE FROM auth_session WHERE id IN
      (SELECT id FROM auth_session WHERE expires_at <= now() OR revoked_at IS NOT NULL
       OR last_seen_at <= now() - interval '12 hours'
       OR (mfa_verified AND last_seen_at <= now() - interval '30 minutes') LIMIT 1000 FOR UPDATE SKIP LOCKED)`;
  }
}
