import { isAdministrativeRole } from '../modules/auth/administrative-role';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { authenticator } from 'otplib';
import { digest, encryptMfa } from '../modules/auth/auth-security';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error('Pass the administrator email as the first argument.');
  const args = process.argv.slice(3);
  const replace = args.length === 1 && args[0] === '--replace-test';
  if (args.length && !replace) throw new Error('Expected --replace-test or no option.');
  if (replace) {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/pharmabalance_catalog_test') {
      console.error('--replace-test requires the local pharmabalance_catalog_test database at 127.0.0.1.');
      process.exitCode = 1;
      return;
    }
  }
  const db = new PrismaClient();
  try {
    const secret = authenticator.generateSecret(20);
    const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(16).toString('base64url'));
    await db.$transaction(async (tx) => {
      const account = await tx.userAccount.findUniqueOrThrow({ where: { email }, include: { role: true } });
      await tx.$queryRaw`SELECT user_id FROM user_account WHERE user_id = ${account.userId} FOR UPDATE`;
      const user = await tx.userAccount.findUniqueOrThrow({
        where: { userId: account.userId }, include: { role: true },
      });
      if (!user.isActive || !isAdministrativeRole(user.role.code)) throw new Error('An active administrator is required.');
      const credentials = { encryptedSecret: encryptMfa(secret, user.userId), recoveryHashes: recoveryCodes.map(digest) };
      if (replace) {
        await tx.authMfa.upsert({
          where: { userId: user.userId },
          create: { userId: user.userId, ...credentials },
          update: { ...credentials, lastStep: -1n },
        });
      } else {
        await tx.authMfa.create({ data: { userId: user.userId, ...credentials } });
      }
      await tx.authSession.updateMany({ where: { userId: user.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.authChallenge.deleteMany({ where: { userId: user.userId } });
      await tx.authAuditEvent.create({ data: { userId: user.userId, event: replace ? 'MFA_REPLACED' : 'MFA_ENROLLED' } });
    });
    console.log(authenticator.keyuri(email, 'PharmeBalance', secret));
    console.log('Save these one-time recovery codes securely:');
    console.log(recoveryCodes.join(String.fromCharCode(10)));
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  console.error('Enrollment failed. Check the account, encryption key and existing MFA enrollment.');
  process.exitCode = 1;
});
