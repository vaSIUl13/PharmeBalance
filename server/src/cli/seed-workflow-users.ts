import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../modules/auth/auth-security';

const people = [
  { login: 'manager', previous: 'olena.koval', firstName: 'Олена', lastName: 'Коваль', role: 'manager', pharmacy: null },
  { login: 'logist-1', previous: 'andrii.melnyk', firstName: 'Андрій', lastName: 'Мельник', role: 'logist', pharmacy: 'SYN-DEV-002' },
  { login: 'logist-2', previous: 'taras.bondar', firstName: 'Тарас', lastName: 'Бондар', role: 'logist', pharmacy: 'SYN-DEV-003' },
  { login: 'head', previous: 'mariia.shevchenko', firstName: 'Марія', lastName: 'Шевченко', role: 'head', pharmacy: 'SYN-DEV-001' },
];

async function main() {
  const database = new URL(process.env.DEMO_DATABASE_URL ?? '');
  const password = process.env.DEMO_USER_PASSWORD;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) || !database.pathname.endsWith('_demo')) {
    throw Error('Use a local _demo database');
  }
  if (!password || password.length < 12) throw Error('Set DEMO_USER_PASSWORD with at least 12 characters');
  const db = new PrismaClient({ datasourceUrl: database.href });
  try {
    const accounts = await db.$transaction(async tx => {
      const result = [];
      for (const { login, previous, firstName, lastName, role, pharmacy } of people) {
        const email = login + '@example.invalid';
        const matches = await tx.userAccount.findMany({
          where: { email: { in: [email, previous + '@example.invalid'] } }, include: { role: true },
        });
        const [existing] = matches;
        if (matches.length > 1 || existing && (existing.role.code !== role ||
            existing.login !== (existing.email === email ? login : previous))) throw Error('Demo account conflict');
        const { userId } = existing ? await tx.userAccount.update({
          where: { userId: existing.userId }, data: { login, email },
        }) : await tx.userAccount.create({
          data: { login, email, firstName, lastName, passwordHash: await hashPassword(password), role: { connect: { code: role } } },
        });
        if (pharmacy) {
          const location = await tx.pharmacy.findFirstOrThrow({ where: { code: pharmacy, isSynthetic: true } });
          const key = { userId, pharmacyId: location.pharmacyId };
          await tx.userPharmacy.upsert({ where: { userId_pharmacyId: key }, create: key, update: { unassignedAt: null } });
        }
        result.push({ email, role, pharmacy });
      }
      return result;
    });
    console.table(accounts);
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  console.error('Demo user seed failed:', error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[DATABASE_URL]') : 'Unknown error');
  process.exitCode = 1;
});
