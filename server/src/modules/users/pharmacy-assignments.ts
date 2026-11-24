import type { Prisma } from '@prisma/client';

export async function lockUser(tx: Prisma.TransactionClient, userId: number) {
  // Keep user updates serialized while allowing foreign-key checks on the account.
  await tx.$queryRaw`SELECT user_id FROM user_account WHERE user_id = ${userId} FOR NO KEY UPDATE`;
}

export async function endAssignments(tx: Prisma.TransactionClient, actor: number, userId: number, role: string) {
  const active = await tx.userPharmacy.findMany({ where: { userId, unassignedAt: null }, orderBy: { pharmacyId: 'asc' } });
  for (const { pharmacyId } of active) {
    await tx.userPharmacy.update({ where: { userId_pharmacyId: { userId, pharmacyId } }, data: { unassignedAt: new Date() } });
    const audit = { userId: actor, targetUserId: userId };
    await tx.auditLog.create({ data: { ...audit, eventType: 'PHARMACY_ASSIGNED', details: 'Assignment ended for pharmacy ' + pharmacyId } });
    if (role === 'head') {
      const changed = await tx.pharmacy.updateMany({ where: { pharmacyId, isActive: true }, data: { isActive: false } });
      if (changed.count) await tx.auditLog.create({ data: { ...audit, eventType: 'REFERENCE_EDITED', details: 'Deactivated pharmacy ' + pharmacyId } });
    }
  }
}
