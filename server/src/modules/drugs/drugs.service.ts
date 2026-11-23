import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DrugsService {
  constructor(private readonly db: PrismaService) {}

  async list(query?: string, after = 0) {
    const rows = await this.db.drug.findMany({
      where: {
        drugId: { gt: after },
        ...(query ? { OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
          { registration: { inn: { contains: query, mode: 'insensitive' } } },
        ] } : {}),
      },
      select: {
        drugId: true, sku: true, name: true, dosageForm: true, strength: true, unit: true, isActive: true,
        registration: { select: { number: true, inn: true, atcCodes: true } },
      },
      orderBy: { drugId: 'asc' }, take: 51,
    });
    const items = rows.slice(0, 50);
    return { items, next: rows.length > 50 ? items[49].drugId : null };
  }
}
