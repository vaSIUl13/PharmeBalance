import type { Prisma } from '@prisma/client';
import { notifyUsers } from './inbox.service';

export const administrators = { role: { code: { in: ['admin', 'superadmin'] } } } satisfies Prisma.UserAccountWhereInput;
export const networkManagers = {
  role: { code: 'manager', rolePermissionRows: { some: { permission: { code: 'NETWORK_VIEW' } } } },
} satisfies Prisma.UserAccountWhereInput;

export function pharmacyStaff(pharmacyIds: number[], includeLogistics = false): Prisma.UserAccountWhereInput {
  return {
    role: { code: { in: includeLogistics ? ['head', 'logist'] : ['head'] },
      rolePermissionRows: { some: { permission: { code: 'PHARMACY_VIEW' } } } },
    userPharmacyRows: { some: { pharmacyId: { in: pharmacyIds }, unassignedAt: null } },
  };
}

export async function notifyPharmacy(tx: Prisma.TransactionClient, pharmacyId: number, title: string, detail: string,
  options: { includeLogistics?: boolean; userId?: number; includeManagers?: boolean } = {}) {
  const pharmacy = await tx.pharmacy.findUniqueOrThrow({ where: { pharmacyId }, select: { name: true, code: true } });
  const audience: Prisma.UserAccountWhereInput[] = [administrators, pharmacyStaff([pharmacyId], options.includeLogistics)];
  if (options.includeManagers !== false) audience.push(networkManagers);
  if (options.userId !== undefined) audience.push({ userId: options.userId });
  await notifyUsers(tx, { OR: audience }, { title, message: `${pharmacy.name} (${pharmacy.code}) · ${detail}` });
}
