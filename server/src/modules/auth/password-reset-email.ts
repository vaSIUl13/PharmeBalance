import { createTransport } from 'nodemailer';
import type { PrismaService } from '../../database/prisma.service';
import { lockUser } from '../users/pharmacy-assignments';
import { digest, token } from './auth-security';

const resetLifetime = 15 * 60_000;

export async function sendPasswordReset(db: PrismaService, email: string) {
  const user = await db.userAccount.findUnique({ where: { email }, select: { userId: true, isActive: true } });
  const smtp = process.env.AUTH_SMTP_URL;
  const from = process.env.AUTH_MAIL_FROM;
  if (!user?.isActive || !smtp || !from) return;
  if (email.endsWith('@example.invalid') && new URL(process.env.DATABASE_URL!).pathname.endsWith('_demo')) return;
  const raw = token();
  const prepared = await db.$transaction(async (tx) => {
    await lockUser(tx, user.userId);
    const active = await tx.userAccount.count({ where: { userId: user.userId, email, isActive: true } });
    if (!active) return false;
    await tx.authChallenge.deleteMany({ where: { userId: user.userId, purpose: 'RESET' } });
    await tx.authChallenge.create({ data: {
      userId: user.userId, purpose: 'RESET', tokenHash: digest(raw), expiresAt: new Date(Date.now() + resetLifetime),
    } });
    await tx.authAuditEvent.create({ data: { event: 'PASSWORD_RESET_REQUESTED', userId: user.userId } });
    return true;
  });
  if (!prepared) return;
  const url = new URL('/reset-password', process.env.AUTH_ORIGIN ?? 'http://localhost:3000');
  url.hash = 'token=' + raw;
  const delivery = new URL(smtp);
  const secure = delivery.protocol === 'smtps:';
  await createTransport({
    host: delivery.hostname, port: Number(delivery.port || (secure ? 465 : 587)), secure,
    requireTLS: !secure && process.env.NODE_ENV === 'production',
    auth: delivery.username ? {
      user: decodeURIComponent(delivery.username), pass: decodeURIComponent(delivery.password),
    } : undefined,
    connectionTimeout: 5000, socketTimeout: 10000,
  }).sendMail({
    from, to: email, subject: 'PharmeBalance password reset', text: 'Reset your password: ' + url,
  });
}
