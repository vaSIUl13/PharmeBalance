import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { hashPassword } from '../auth/auth-security';
import type { CreateUserDto, UserAccessDto } from './dto/user-input';
import { endAssignments, lockUser } from './pharmacy-assignments';

const userFields = { userId: true, login: true, email: true, firstName: true, lastName: true,
  isActive: true, role: { select: { code: true } } } satisfies Prisma.UserAccountSelect;

@Injectable()
export class UsersService {
  constructor(private readonly db: PrismaService) {}

  roles() {
    return this.db.role.findMany({
      select: { code: true, name: true, dataScope: true }, orderBy: { code: 'asc' },
    });
  }

  async list(after?: number) {
    const rows = await this.db.userAccount.findMany({
      where: after === undefined ? {} : { userId: { gt: after } },
      select: { ...userFields, userPharmacyRows: {
        where: { unassignedAt: null }, select: { pharmacyId: true }, orderBy: { pharmacyId: 'asc' },
      } },
      orderBy: { userId: 'asc' }, take: 51,
    });
    const items = rows.slice(0, 50).map(({ userPharmacyRows, ...account }) => ({
      ...account, pharmacyIds: userPharmacyRows.map(row => row.pharmacyId),
    }));
    return { items, next: rows.length > 50 ? items[49].userId : null };
  }

  async create(actor: number, input: CreateUserDto) {
    const { password, ...profile } = input;
    const passwordHash = await hashPassword(password);
    try {
      return await this.db.$transaction(tx => this.createWithHash(tx, actor, profile, passwordHash));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Login or email already exists');
      throw error;
    }
  }

  async createWithHash(tx: Prisma.TransactionClient, actor: number,
    input: Omit<CreateUserDto, 'password'>, passwordHash: string) {
    const { role, pharmacyId, ...profile } = input;
    const user = await tx.userAccount.create({
      data: { ...profile, passwordHash, role: { connect: { code: role } } }, select: userFields,
    });
    await tx.auditLog.create({
      data: { userId: actor, targetUserId: user.userId, eventType: 'ACCOUNT_CREATED', details: 'Created account with role ' + role },
    });
    await this.assign(tx, actor, user.userId, role, pharmacyId);
    return user;
  }

  async update(actor: number, userId: number, access: UserAccessDto) {
    return this.db.$transaction(async tx => {
      await lockUser(tx, userId);
      const user = await tx.userAccount.findUnique({ where: { userId }, select: userFields });
      if (!user) throw new NotFoundException('User not found');
      if (!user.isActive) throw new ConflictException('Account is blocked');
      const role = access.role ?? user.role.code;
      if (role !== user.role.code) {
        if (actor === userId) throw new ForbiddenException('Cannot change your own role');
        await endAssignments(tx, actor, userId, user.role.code);
        await tx.userAccount.update({ where: { userId }, data: { role: { connect: { code: role } } } });
        await tx.auditLog.create({ data: { userId: actor, targetUserId: userId, eventType: 'ROLE_CHANGED', details: user.role.code + ' -> ' + role } });
      }
      await this.assign(tx, actor, userId, role, access.pharmacyId);
      return { ...user, role: { code: role } };
    });
  }

  private async assign(tx: Prisma.TransactionClient, actor: number, userId: number, role: string, pharmacyId?: number) {
    const current = await tx.userPharmacy.findMany({ where: { userId, unassignedAt: null }, select: { pharmacyId: true } });
    if (pharmacyId === undefined) {
      if (role === 'head' && current.length !== 1) throw new BadRequestException('A pharmacy is required for a head');
      return;
    }
    if (role !== 'head' && role !== 'logist') throw new BadRequestException('Role does not support pharmacy assignments');
    if (role === 'head' && current.some(row => row.pharmacyId !== pharmacyId)) throw new ConflictException('Head already serves another pharmacy');
    const found = await tx.$queryRaw<{ pharmacy_id: number }[]>`SELECT pharmacy_id FROM pharmacy WHERE pharmacy_id = ${pharmacyId} FOR UPDATE`;
    if (!found.length) throw new NotFoundException('Managed pharmacy not found');
    if (role === 'head' && await tx.userPharmacy.findFirst({ where: {
      pharmacyId, unassignedAt: null, userId: { not: userId }, user: { role: { code: 'head' }, isActive: true },
    } })) throw new ConflictException('Pharmacy already has a head');
    const audit = { userId: actor, targetUserId: userId };
    if (!current.some(row => row.pharmacyId === pharmacyId)) {
      await tx.userPharmacy.upsert({ where: { userId_pharmacyId: { userId, pharmacyId } }, create: { userId, pharmacyId },
        update: { assignedAt: new Date(), unassignedAt: null } });
      await tx.auditLog.create({ data: { ...audit, eventType: 'PHARMACY_ASSIGNED', details: 'Assigned to pharmacy ' + pharmacyId } });
    }
    if (role === 'head') {
      const changed = await tx.pharmacy.updateMany({ where: { pharmacyId, isActive: false }, data: { isActive: true } });
      if (changed.count) await tx.auditLog.create({ data: { ...audit, eventType: 'REFERENCE_EDITED', details: 'Activated pharmacy ' + pharmacyId } });
    }
  }
}
