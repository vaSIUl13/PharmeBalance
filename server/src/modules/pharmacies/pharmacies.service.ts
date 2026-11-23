import { isAdministrativeRole } from '../auth/administrative-role';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { pharmacyScope } from '../auth/auth-scope';
import type { Principal } from '../auth/auth.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PharmaciesService {
  constructor(private readonly db: PrismaService) {}

  private visibleTo(user: Principal): Prisma.PharmacyWhereInput {
    if (isAdministrativeRole(user.role) && user.permissions.includes('REFERENCE_EDIT')) return {};
    return pharmacyScope(user);
  }

  async list(user: Principal, after: number) {
    const rows = await this.db.pharmacy.findMany({
      where: { AND: [this.visibleTo(user), { pharmacyId: { gt: after } }] },
      orderBy: { pharmacyId: 'asc' }, take: 51,
    });
    return { items: rows.slice(0, 50), next: rows.length > 50 ? rows[49].pharmacyId : null };
  }

  async detail(user: Principal, pharmacyId: number) {
    const row = await this.db.pharmacy.findFirst({ where: { AND: [this.visibleTo(user), { pharmacyId }] } });
    if (!row) throw new NotFoundException('Managed pharmacy not found');
    return row;
  }

  async external(query?: string, after?: number, complete = false) {
    const rows = await this.db.externalPharmacy.findMany({
      where: {
        ...(after === undefined ? {} : { id: { gt: after } }),
        ...(complete ? { name: { not: null }, city: { not: null }, address: { not: null },
          latitude: { not: null }, longitude: { not: null } } : {}),
        ...(query ? { OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { city: { contains: query, mode: 'insensitive' } },
          { address: { contains: query, mode: 'insensitive' } },
        ] } : {}),
      },
      orderBy: { id: 'asc' }, take: 51,
    });
    const items = rows.slice(0, 50);
    return { items, next: rows.length > 50 ? items[49].id : null };
  }

  async externalMap(box: { south: number; west: number; north: number; east: number }, limit: number) {
    const rows = await this.db.externalPharmacy.findMany({
      where: {
        name: { not: null },
        latitude: { gte: box.south, lte: box.north },
        longitude: { gte: box.west, lte: box.east },
      },
      select: { id: true, name: true, city: true, address: true, latitude: true, longitude: true, pharmacyId: true },
      orderBy: { id: 'asc' }, take: limit + 1,
    });
    return { items: rows.slice(0, limit), truncated: rows.length > limit };
  }

  async create(data: Pick<Prisma.PharmacyCreateInput, 'code' | 'name' | 'city' | 'address' | 'latitude' | 'longitude'>,
    externalIds: number[], actor: number) {
    try {
      return await this.db.$transaction(async (tx) => {
        const pharmacy = await tx.pharmacy.create({ data: { ...data, isActive: false } });
        if (externalIds.length) {
          const linked = await tx.externalPharmacy.updateMany({
            where: { id: { in: externalIds }, pharmacyId: null }, data: { pharmacyId: pharmacy.pharmacyId },
          });
          if (linked.count !== externalIds.length) throw new ConflictException('Some external records are missing or already linked');
        }
        await tx.auditLog.create({
          data: { userId: actor, eventType: 'REFERENCE_EDITED', details: 'Created managed pharmacy ' + pharmacy.code },
        });
        return pharmacy;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Pharmacy code already exists');
      }
      throw error;
    }
  }
}
