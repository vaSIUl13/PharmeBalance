import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { administrators, networkManagers } from '../notifications/business-notifications';
import { notifyUsers } from '../notifications/inbox.service';
import type { DrugCreate, DrugUpdate } from './dto/drug-write.dto';

const selectedDrug = {
  drugId: true, sku: true, name: true, dosageForm: true, strength: true, unit: true, isActive: true,
  registration: { select: { number: true, inn: true, atcCodes: true } },
} satisfies Prisma.DrugSelect;

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
      select: selectedDrug,
      orderBy: { drugId: 'asc' }, take: 51,
    });
    const items = rows.slice(0, 50);
    return { items, next: rows.length > 50 ? items[49].drugId : null };
  }

  async create(data: DrugCreate, actor: number) {
    try {
      return await this.db.$transaction(async tx => {
        const drug = await tx.drug.create({ data, select: selectedDrug });
        await this.recordChange(tx, actor, drug.sku, 'Created local drug SKU', 'Додано препарат мережі');
        return drug;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Drug SKU already exists');
      }
      throw error;
    }
  }

  update(drugId: number, data: DrugUpdate, actor: number) {
    return this.db.$transaction(async tx => {
      const where = { drugId };
      await tx.$queryRaw`SELECT drug_id FROM drug WHERE drug_id = ${drugId} FOR NO KEY UPDATE`;
      const current = await tx.drug.findUnique({ where, select: selectedDrug });
      if (!current) throw new NotFoundException('Drug not found');
      if (current.name === data.name) return current;
      const drug = await tx.drug.update({ where, data, select: selectedDrug });
      await this.recordChange(tx, actor, drug.sku, 'Updated drug name', 'Змінено назву препарату');
      return drug;
    });
  }

  private async recordChange(tx: Prisma.TransactionClient, actor: number, sku: string, action: string, title: string) {
    await tx.auditLog.create({ data: { userId: actor, eventType: 'REFERENCE_EDITED', details: action + ' ' + sku } });
    await notifyUsers(tx, { OR: [administrators, networkManagers] }, { title, message: sku });
  }
}
