import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { pharmacyScope } from '../auth/auth-scope';
import type { Principal } from '../auth/auth.service';

export type ForecastView = 'forecasts' | 'risks' | 'surpluses' | 'classifications';

@Injectable()
export class ForecastsService {
  constructor(private readonly db: PrismaService) {}

  async list(user: Principal, view: ForecastView, pharmacyId?: number, after?: number, asOf?: Date) {
    if (!(user.role === 'manager' && user.permissions.includes('NETWORK_VIEW') ||
          user.role === 'head' && user.permissions.includes('PHARMACY_VIEW'))) throw new ForbiddenException();
    const synthetic = new URL(process.env.DATABASE_URL!).pathname.endsWith('_demo');
    const run = await this.db.forecastRun.findFirst({ where: { synthetic, asOf }, orderBy: [{ asOf: 'desc' }, { id: 'desc' }] });
    if (!run) return { run: null, items: [], next: null };
    const where: Prisma.ForecastWhereInput = { runId: run.id, stock: { pharmacyId, pharmacy: pharmacyScope(user) } };
    if (view === 'risks') where.OR = [
      { shortageProbability: { gt: 0 } }, { quantity: { lt: this.db.forecast.fields.msl } },
    ];
    if (view === 'surpluses') where.currentSurplus = { gt: 0 };
    const rows = await this.db.forecast.findMany({ where, take: 51,
      ...(after ? { cursor: { forecastId: after }, skip: 1 } : {}),
      orderBy: view === 'risks' ? [{ shortageProbability: { sort: 'desc', nulls: 'last' } }, { forecastId: 'asc' }] : { forecastId: 'asc' },
      include: { risk: true, stock: { select: { pharmacyId: true, drug: { select: { sku: true, name: true } } } } },
    });
    const items = rows.slice(0, 50);
    return { run, items, next: rows.length > 50 ? items[49].forecastId : null };
  }
}
