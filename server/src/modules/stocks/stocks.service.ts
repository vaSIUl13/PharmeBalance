import { isAdministrativeRole } from '../auth/administrative-role';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { pharmacyScope } from '../auth/auth-scope';
import type { Principal } from '../auth/auth.service';
import { type CreateStockDto, type StockThresholdsDto, validateLevels } from './dto/stock-input';

@Injectable()
export class StocksService {
  constructor(private readonly db: PrismaService) {}

  private scope(user: Principal) {
    if (isAdministrativeRole(user.role) && user.permissions.includes('THRESHOLDS_EDIT')) return {};
    return pharmacyScope(user);
  }

  list(user: Principal, after?: number, pharmacyId?: number, sku?: string) {
    return this.db.stockItem.findMany({
      where: { pharmacy: this.scope(user), pharmacyId, drug: sku ? { sku } : undefined,
        stockId: after === undefined ? undefined : { gt: after } },
      take: 100, orderBy: { stockId: 'asc' },
    });
  }

  async currentPositions(user: Principal, after?: number) {
    if (user.role !== 'head') throw new ForbiddenException();
    const synthetic = new URL(process.env.DATABASE_URL!).pathname.endsWith('_demo');
    const run = await this.db.forecastRun.findFirst({ where: { synthetic },
      orderBy: [{ asOf: 'desc' }, { id: 'desc' }], select: { id: true, asOf: true } });
    const pageSize = 100;
    const rows = await this.db.stockItem.findMany({
      where: { pharmacy: { AND: [this.scope(user), { isSynthetic: synthetic }] }, stockId: { gt: after } },
      orderBy: { stockId: 'asc' }, take: pageSize + 1,
      select: {
        stockId: true, quantity: true, msl: true, maxLevel: true, pharmacyId: true,
        drug: { select: { sku: true, name: true } },
        forecastRows: { where: { runId: run?.id ?? -1 }, take: 1, select: {
          abcClass: true, xyzClass: true, shortageProbability: true, predictedDemand: true, risk: true,
        } },
      },
    });
    const items = rows.slice(0, pageSize).map(({ forecastRows: [forecast], pharmacyId, drug, ...stock }) => ({
      ...stock, stock: { pharmacyId, drug },
      abcClass: forecast?.abcClass ?? null, xyzClass: forecast?.xyzClass ?? null,
      shortageProbability: forecast?.shortageProbability ?? null, predictedDemand: forecast?.predictedDemand ?? null,
      risk: forecast?.risk ?? null,
    }));
    return { asOf: run?.asOf ?? null, items, next: rows.length > pageSize ? items.at(-1)!.stockId : null };
  }

  async create(user: Principal, input: CreateStockDto) {
    const { sku, pharmacyId, ...levels } = input;
    try {
      return await this.db.$transaction(async tx => {
        const pharmacy = await tx.pharmacy.findFirst({ where: { AND: [this.scope(user), { pharmacyId }] },
          select: { pharmacyId: true } });
        if (!pharmacy) throw new NotFoundException('Managed pharmacy not found');
        const drug = await tx.drug.findUnique({ where: { sku }, select: { drugId: true } });
        if (!drug) throw new NotFoundException('SKU not found');
        const stock = await tx.stockItem.create({ data: { pharmacyId, drugId: drug.drugId, ...levels } });
        await tx.auditLog.create({ data: { userId: user.userId, stockId: stock.stockId, eventType: 'THRESHOLDS_CHANGED',
          details: `Created stock with quantity ${stock.quantity}, MSL ${stock.msl}, Max ${stock.maxLevel}` } });
        return stock;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Stock already exists for this pharmacy and SKU');
      }
      throw error;
    }
  }

  updateThresholds(user: Principal, stockId: number, input: StockThresholdsDto) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT stock_id FROM stock_item WHERE stock_id = ${stockId} FOR UPDATE`;
      const stock = await tx.stockItem.findFirst({ where: { stockId, pharmacy: this.scope(user) } });
      if (!stock) throw new NotFoundException('Stock not found');
      const msl = input.msl ?? stock.msl;
      const maxLevel = input.maxLevel ?? stock.maxLevel;
      validateLevels(msl, maxLevel);
      if (stock.msl === msl && stock.maxLevel === maxLevel) return stock;
      const updated = await tx.stockItem.update({ where: { stockId }, data: { msl, maxLevel, updatedAt: new Date() } });
      await tx.auditLog.create({ data: { stockId, userId: user.userId, eventType: 'THRESHOLDS_CHANGED',
        details: `MSL ${stock.msl} -> ${msl}, Max ${stock.maxLevel} -> ${maxLevel}` } });
      return updated;
    });
  }
}
