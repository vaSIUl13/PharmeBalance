import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PharmaciesService {
  constructor(private readonly db: PrismaService) {}

  async external(query?: string, after?: number) {
    const rows = await this.db.externalPharmacy.findMany({
      where: {
        ...(after === undefined ? {} : { id: { gt: after } }),
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
