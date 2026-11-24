import type { Prisma } from '@prisma/client';

type AudienceInput = {
  code: string;
  actorId: number;
  managerId?: number;
  donorId: number;
  recipientId: number;
  internal?: boolean;
};

export function transferAudience({ code, actorId, managerId, donorId, recipientId, internal = false }: AudienceInput) {
  const match = (role: string, permissions: string[], pharmacyIds?: number[], userId?: number): Prisma.UserAccountWhereInput => ({
    userId,
    ...(pharmacyIds && { userPharmacyRows: { some: { pharmacyId: { in: pharmacyIds }, unassignedAt: null } } }),
    role: { code: role, AND: permissions.map(code => ({ rolePermissionRows: { some: { permission: { code } } } })) },
  });
  const logist = match('logist', code === 'CONFIRM' ? ['PHARMACY_VIEW', 'TRANSFER_VIEW', 'TRANSFER_DISPATCH']
    : ['PHARMACY_VIEW', 'TRANSFER_VIEW'], [donorId]);
  const head = match('head', ['PHARMACY_VIEW'], [donorId, recipientId]);
  const owner = code === 'REJECT' || code === 'STALE' ? actorId : managerId;
  const manager = owner === undefined ? { userId: { in: [] } } : match('manager', ['NETWORK_VIEW'], undefined, owner);
  const rules = { logist, head, manager };
  const routes: Record<string, (keyof typeof rules)[]> = {
    CONFIRM: ['logist'], DISPATCH: ['head', 'manager'], RECEIVE: internal ? ['manager', 'logist', 'head'] : ['manager'],
    REJECT: ['manager'], CANCEL: ['logist', 'manager'], STALE: ['manager'],
  };
  const roles = routes[code] ?? [];
  const where: Prisma.UserAccountWhereInput = { isActive: true, OR: roles.map(role => rules[role]) };
  return { roles, where };
}
