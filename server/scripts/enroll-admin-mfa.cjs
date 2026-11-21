const { randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { authenticator } = require('otplib');
const { digest, encryptMfa } = require('../dist/modules/auth/auth-security');

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error('Pass the administrator email as the first argument.');
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
      if (!user.isActive || user.role.code !== 'admin') throw new Error('An active administrator is required.');
      await tx.authMfa.create({ data: { userId: user.userId, encryptedSecret: encryptMfa(secret, user.userId), recoveryHashes: recoveryCodes.map(digest) } });
      await tx.authSession.updateMany({ where: { userId: user.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.authChallenge.deleteMany({ where: { userId: user.userId } });
      await tx.authAuditEvent.create({ data: { userId: user.userId, event: 'MFA_ENROLLED' } });
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
