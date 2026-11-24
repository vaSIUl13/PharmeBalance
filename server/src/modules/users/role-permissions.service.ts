import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { isAdministrativeRole } from '../auth/administrative-role';
import type { Principal } from '../auth/auth.service';
import { notifyUsers } from '../notifications/inbox.service';
import { lockUser } from './pharmacy-assignments';

const editableRoles = ['admin', 'manager', 'head', 'logist'];
const allowedRoles: Record<string, readonly string[]> = {
  USERS_MANAGE: ['admin'],
  REFERENCE_EDIT: ['admin'],
  AUDIT_VIEW: ['admin', 'manager'],
  THRESHOLDS_EDIT: ['admin', 'manager'],
  NETWORK_VIEW: ['admin', 'manager'],
  STATS_VIEW: ['manager'],
  REC_DECIDE: ['manager'],
  REC_CANCEL: ['manager'],
  PHARMACY_VIEW: ['head', 'logist'],
  DATA_IMPORT: ['head'],
  RECEIPT_CONFIRM: ['head'],
  TRANSFER_VIEW: ['logist'],
  TRANSFER_DISPATCH: ['logist'],
};

export function canGrant(role: string, permission: string) {
  return (allowedRoles[permission] ?? []).includes(role);
}

@Injectable()
export class RolePermissionsService {
  constructor(private readonly db: PrismaService) {}

  async catalog(actor: Principal) {
    if (!isAdministrativeRole(actor.role)) throw new ForbiddenException();
    const permissions = await this.db.permission.findMany({
      where: { code: { not: 'REGISTRATION_REVIEW' } }, select: { code: true, name: true }, orderBy: { code: 'asc' },
    });
    return permissions.map(permission => ({
      ...permission, grantableRoles: editableRoles.filter(role => canGrant(role, permission.code)),
    }));
  }

  async set(actor: Principal, roleCode: string, code: string, granted: boolean) {
    if (actor.role !== 'superadmin' || !editableRoles.includes(roleCode) || code === 'REGISTRATION_REVIEW' ||
        granted && !canGrant(roleCode, code)) throw new ForbiddenException();
    return this.db.$transaction(async tx => {
      await lockUser(tx, actor.userId);
      const owner = await tx.userAccount.findFirst({
        where: { userId: actor.userId, isActive: true, role: { code: 'superadmin' } }, select: { userId: true },
      });
      if (!owner) throw new ForbiddenException();
      await tx.$queryRaw`SELECT role_id FROM "role" WHERE code = ${roleCode} FOR UPDATE`;
      const role = await tx.role.findUnique({ where: { code: roleCode } });
      const permission = await tx.permission.findUnique({ where: { code } });
      if (!role || !permission) throw new NotFoundException('Role or permission not found');
      const pair = { roleId: role.roleId, permissionId: permission.permissionId };
      const result = granted
        ? await tx.rolePermission.createMany({ data: [pair], skipDuplicates: true })
        : await tx.rolePermission.deleteMany({ where: pair });
      if (result.count) {
        await tx.auditLog.create({ data: {
          userId: actor.userId, eventType: 'ROLE_PERMISSION_CHANGED',
          details: `${roleCode} · ${code} · ${granted ? 'granted' : 'revoked'}`,
        } });
        await notifyUsers(tx, { roleId: role.roleId }, {
          title: 'Змінено дозволи вашої ролі',
          message: `${role.name} · ${granted ? 'Надано' : 'Відкликано'} дозвіл «${permission.name}».`,
        });
      }
      return { role: roleCode, permission: code, granted, changed: result.count > 0 };
    });
  }
}
