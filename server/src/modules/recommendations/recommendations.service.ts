import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { Principal } from '../auth/auth.service';
import { transferScope } from '../auth/auth-scope';
import { lockUser } from '../users/pharmacy-assignments';
import { activeTransfers, generateRecommendations } from './generate';
import { transferLimit } from './donor-selection';

export const commands = ['CONFIRM', 'REJECT', 'CANCEL', 'DISPATCH', 'RECEIVE'] as const;
export type Command = typeof commands[number];
const stock = { include: { pharmacy: true, drug: true } } satisfies Prisma.StockItemDefaultArgs;
const positions = { donorStock: stock, recipientStock: stock } satisfies Prisma.RecommendationInclude;

@Injectable()
export class RecommendationsService {
  constructor(private readonly db: PrismaService) {}

  list(user: Principal, after?: number) {
    return this.db.recommendation.findMany({
      where: transferScope(user),
      ...(after ? { cursor: { recommendationId: after }, skip: 1 } : {}),
      take: 100, orderBy: [{ forecast: { runId: { sort: 'desc', nulls: 'last' } } }, { priority: 'asc' },
        { recommendationId: 'desc' }],
    });
  }

  async detail(user: Principal, id: number) {
    const result = await this.db.recommendation.findFirst({
      where: { AND: [{ recommendationId: id }, transferScope(user)] }, include: positions,
    });
    if (!result) throw new NotFoundException();
    return result;
  }

  async history(user: Principal, id: number) {
    await this.detail(user, id);
    return this.db.recommendationAction.findMany({ where: { recommendationId: id, recommendation: transferScope(user) },
      include: { actionType: { select: { code: true, fromStatus: true, toStatus: true } } }, orderBy: { actionId: 'asc' } });
  }

  generate(user: Principal, runId: number) {
    if (user.role !== 'manager' || !user.permissions.includes('NETWORK_VIEW')) throw new ForbiddenException();
    const synthetic = new URL(process.env.DATABASE_URL!).pathname.endsWith('_demo');
    return this.db.$transaction(tx => generateRecommendations(tx, runId, synthetic), { timeout: 120000 });
  }

  async act(user: Principal, id: number, command: Command, quantity?: number, comment?: string) {
    const result = await this.db.$transaction(async tx => {
      await lockUser(tx, user.userId);
      await tx.$queryRaw`SELECT recommendation_id FROM recommendation WHERE recommendation_id = ${id} FOR UPDATE`;
      const record = await tx.recommendation.findFirst({
        where: { AND: [{ recommendationId: id }, transferScope(user)] },
        include: { ...positions, forecast: true },
      });
      if (!record) throw new NotFoundException();
      const action = await tx.actionType.findUniqueOrThrow({ where: { code: command }, include: { permission: true } });
      const role = command === 'DISPATCH' ? 'logist' : command === 'RECEIVE' ? 'head' : 'manager';
      const live = await tx.userAccount.findFirst({ where: { userId: user.userId, isActive: true,
        role: { code: role, rolePermissionRows: { some: { permissionId: action.permissionId } } } }, select: { userId: true } });
      if (!live || !user.permissions.includes(action.permission.code)) throw new ForbiddenException();
      if (command === 'RECEIVE' && quantity !== record.quantity) {
        throw new BadRequestException('Received quantity must equal the dispatched quantity');
      }
      const key = { recommendationId: id, actionTypeId: action.actionTypeId };
      if (await tx.recommendationAction.findUnique({ where: { recommendationId_actionTypeId: key } })) {
        return { recommendationId: id, status: record.status, replayed: true };
      }
      if (record.status !== action.fromStatus) throw new ConflictException('Invalid transition from ' + record.status);
      const ids = [record.donorStockId, record.recipientStockId];
      const pharmacyIds = [record.donorStock.pharmacyId, record.recipientStock.pharmacyId];
      if (command !== 'REJECT') {
        await tx.$queryRaw`SELECT pharmacy_id FROM pharmacy WHERE pharmacy_id IN (${Prisma.join(pharmacyIds)})
          ORDER BY pharmacy_id FOR SHARE`;
        await tx.$queryRaw`SELECT stock_id FROM stock_item WHERE stock_id IN (${Prisma.join(ids)}) ORDER BY stock_id FOR UPDATE`;
      }
      const stocks = command === 'REJECT' ? [] : await tx.stockItem.findMany({ where: { stockId: { in: ids } }, ...stock });
      const donor = stocks.find(s => s.stockId === record.donorStockId);
      const recipient = stocks.find(s => s.stockId === record.recipientStockId);
      const amount = record.quantity;
      const save = async (transition: typeof action) => {
        await tx.recommendation.update({ where: { recommendationId: id }, data: { status: transition.toStatus } });
        await tx.recommendationAction.create({ data: { recommendationId: id, actionTypeId: transition.actionTypeId,
          userId: user.userId, quantity: amount, comment } });
        return { recommendationId: id, status: transition.toStatus, replayed: false };
      };
      if (command === 'CONFIRM' && donor && recipient) {
        const f = record.forecast;
        const inbound = await tx.recommendation.aggregate({ where: { recipientStockId: recipient.stockId,
          status: { in: [...activeTransfers] } }, _sum: { quantity: true } });
        const need = Math.ceil(recipient.msl - recipient.quantity + Number(f?.predictedDemand ?? 0)) - (inbound._sum.quantity ?? 0);
        const newest = f && await tx.forecastRun.findFirst({ where: { synthetic: recipient.pharmacy.isSynthetic },
          orderBy: [{ asOf: 'desc' }, { id: 'desc' }], select: { id: true } });
        const liveSales = f && await tx.sale.findFirst({ where: { stockId: recipient.stockId,
          import: { uploadedAt: { gt: f.createdAt } } }, select: { saleId: true } });
        const valid = f && newest?.id === f.runId && !liveSales && recipient.updatedAt <= f.createdAt &&
          recipient.quantityAsOf <= f.createdAt && recipient.quantity === f.quantity && recipient.msl === f.msl &&
          donor.pharmacy.isActive && recipient.pharmacy.isActive && donor.drug.isActive &&
          donor.pharmacy.isSynthetic === recipient.pharmacy.isSynthetic && donor.drugId === recipient.drugId &&
          donor.pharmacyId !== recipient.pharmacyId && amount <= transferLimit() && need >= amount &&
          donor.quantity - donor.maxLevel - donor.reservedQuantity >= amount;
        if (!valid) return save(await tx.actionType.findUniqueOrThrow({ where: { code: 'STALE' }, include: { permission: true } }));
        await tx.stockItem.update({ where: { stockId: donor.stockId }, data: { reservedQuantity: { increment: amount } } });
      } else if (command === 'CANCEL' || command === 'DISPATCH' || command === 'RECEIVE') {
        if (!donor || !recipient || donor.reservedQuantity < amount || donor.quantity < amount) {
          throw new ConflictException('Reservation is no longer available');
        }
        if (command !== 'CANCEL' && (donor.drugId !== recipient.drugId || donor.pharmacyId === recipient.pharmacyId ||
            donor.pharmacy.isSynthetic !== recipient.pharmacy.isSynthetic)) {
          throw new ConflictException('Invalid donor and recipient stock pair');
        }
        if (command === 'DISPATCH' && (!donor.pharmacy.isActive || !recipient.pharmacy.isActive || !donor.drug.isActive)) {
          throw new ConflictException('The pharmacy or SKU is inactive. Cancel the reservation before dispatch.');
        }
        if (command === 'CANCEL' || command === 'RECEIVE') {
          await tx.stockItem.update({ where: { stockId: donor.stockId }, data: {
            reservedQuantity: { decrement: amount },
            ...(command === 'RECEIVE' ? { quantity: { decrement: amount }, updatedAt: new Date() } : {}),
          } });
        }
        if (command === 'RECEIVE') {
          if (recipient.quantity > 2147483647 - amount) throw new ConflictException('Recipient stock capacity exceeded');
          await tx.stockItem.update({ where: { stockId: recipient.stockId }, data: {
            quantity: { increment: amount }, updatedAt: new Date(),
          } });
        }
      }
      return save(action);
    });
    if (command === 'CONFIRM' && result.status === 'STALE') throw new ConflictException('Recommendation is stale. Recalculate the forecast and recommendations.');
    return result;
  }
}
