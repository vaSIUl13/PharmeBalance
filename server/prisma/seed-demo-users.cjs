const { argon2Sync, randomBytes, timingSafeEqual } = require('node:crypto');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');

const roles = ['admin', 'manager', 'head', 'logist'];
const params = { parallelism: 1, memory: 19456, passes: 2, tagLength: 32 };
const encode = (buffer) => buffer.toString('base64').replace(/=+$/, '');
const derive = (password, nonce) =>
  argon2Sync('argon2id', { ...params, message: Buffer.from(password), nonce });

async function seed() {
  const password = process.env.DEMO_USER_PASSWORD;
  if (!password) throw new Error('Set DEMO_USER_PASSWORD before running this seed.');

  const url = new URL(process.env.DATABASE_URL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('This demo seed requires a local database.');
  }

  const prisma = new PrismaClient();
  try {
    const accounts = await prisma.$transaction(async (tx) => {
      const pharmacy = await tx.pharmacy.findUniqueOrThrow({ where: { code: 'DEMO-01' } });
      const result = [];

      for (const code of roles) {
        const email = code + '.test@example.com';
        const role = await tx.role.findUniqueOrThrow({ where: { code } });
        const nonce = randomBytes(16);
        const tag = derive(password, nonce);
        const passwordHash = [
          '', 'argon2id', 'v=19', 'm=19456,t=2,p=1', encode(nonce), encode(tag),
        ].join('$');
        const account = await tx.userAccount.upsert({
          where: { email },
          create: {
            email,
            login: code + '.test',
            roleId: role.roleId,
            firstName: code,
            lastName: 'Demo',
            passwordHash,
          },
          update: { roleId: role.roleId, passwordHash, isActive: true },
          include: { role: true },
        });
        const [, algorithm, version, options, salt, digest] = account.passwordHash.split('$');
        assert.equal(algorithm + version + options, 'argon2idv=19m=19456,t=2,p=1');
        assert(timingSafeEqual(derive(password, Buffer.from(salt, 'base64')), Buffer.from(digest, 'base64')));
        assert.equal(account.role.code, code);

        if (code === 'head' || code === 'logist') {
          const key = { userId: account.userId, pharmacyId: pharmacy.pharmacyId };
          await tx.userPharmacy.upsert({
            where: { userId_pharmacyId: key },
            create: key,
            update: { unassignedAt: null },
          });
        }
        result.push({ email: account.email, role: code });
      }
      return result;
    });
    console.table(accounts);
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
