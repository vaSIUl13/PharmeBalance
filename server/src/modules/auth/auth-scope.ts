import type { Prisma } from '@prisma/client';
import type { Principal } from './auth.service';

type Scope = Pick<Principal, 'userId' | 'role' | 'permissions'>;

export function pharmacyScope(principal: Scope): Prisma.PharmacyWhereInput {
  if (principal.permissions.includes('NETWORK_VIEW')) return {};
  if (!principal.permissions.includes('PHARMACY_VIEW')) return { pharmacyId: { in: [] } };
  return { userPharmacyRows: { some: { userId: principal.userId, unassignedAt: null } } };
}

export function transferScope(principal: Scope): Prisma.RecommendationWhereInput {
  if (principal.permissions.includes('NETWORK_VIEW')) return {};
  if (principal.role === 'logist' && principal.permissions.includes('TRANSFER_VIEW')) {
    return {
      status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
      donorStock: { pharmacy: pharmacyScope(principal) },
    };
  }
  if (principal.role === 'head' && principal.permissions.includes('RECEIPT_CONFIRM')) {
    return {
      status: { in: ['IN_PROGRESS', 'COMPLETED'] },
      recipientStock: { pharmacy: pharmacyScope(principal) },
    };
  }
  return { recommendationId: { in: [] } };
}
