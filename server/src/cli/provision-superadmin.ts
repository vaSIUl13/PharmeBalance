import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../modules/auth/auth-security';
import { endAssignments, lockUser } from '../modules/users/pharmacy-assignments';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Pass a valid email as the first argument.');
  }
  const password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
  if (password.length < 8 || password.length > 256) throw new Error('Supply a password on stdin (8–256 characters).');
  const passwordHash = await hashPassword(password);
  const db = new PrismaClient();
  try {
    await db.$transaction(async tx => {
      const role = await tx.role.findUniqueOrThrow({ where: { code: 'superadmin' } });
      const existing = await tx.userAccount.findUnique({ where: { email }, select: { userId: true, role: { select: { code: true } } } });
      if (existing) await lockUser(tx, existing.userId);
      const account = await tx.userAccount.upsert({
        where: { email },
        create: { email, login: 'owner-' + randomUUID(),
          firstName: 'Super', lastName: 'Admin', roleId: role.roleId, passwordHash },
        update: { roleId: role.roleId, passwordHash, isActive: true },
        select: { userId: true },
      });
      if (existing) {
        await endAssignments(tx, account.userId, account.userId, existing.role.code);
        await tx.authSession.updateMany({ where: { userId: account.userId, revokedAt: null },
          data: { revokedAt: new Date() } });
        await tx.authChallenge.deleteMany({ where: { userId: account.userId } });
      }
      await tx.authAuditEvent.create({ data: { userId: account.userId, event: 'SUPERADMIN_PROVISIONED' } });
    });
  } finally {
    await db.$disconnect();
  }
  console.log('Superadministrator provisioned. MFA enrollment is required for new accounts.');
}

main().catch(() => {
  console.error('Provisioning failed. Check the email, stdin password, database connection and migrations.');
  process.exitCode = 1;
});
