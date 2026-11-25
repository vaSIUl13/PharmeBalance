import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { transferScope } from '../auth/auth-scope';
import type { Principal } from '../auth/auth.service';

type Content = Pick<Prisma.SystemNotificationCreateManyInput, 'title' | 'message' | 'recommendationId' | 'recommendationIds'>;

export async function notifyUsers(tx: Prisma.TransactionClient, audience: Prisma.UserAccountWhereInput, content: Content) {
  const users = await tx.userAccount.findMany({
    where: { AND: [{ isActive: true }, audience] }, select: { userId: true },
  });
  if (users.length) {
    await tx.systemNotification.createMany({ data: users.map(({ userId }) => ({ userId, ...content })) });
  }
}

function visibleTo(user: Principal): Prisma.SystemNotificationWhereInput {
  return {
    userId: user.userId,
    OR: [{ recommendationId: null }, { recommendation: { isNot: null, is: transferScope(user) } }],
  };
}

@Injectable()
export class InboxService {
  constructor(private readonly db: PrismaService) {}

  async list(user: Principal, before?: number) {
    const where = visibleTo(user);
    const [rows, unread] = await this.db.$transaction([
      this.db.systemNotification.findMany({
        where: { ...where, id: before === undefined ? undefined : { lt: before } },
        select: { id: true, title: true, message: true, recommendationId: true,
          recommendationIds: user.role === 'manager' && user.permissions.includes('NETWORK_VIEW'), createdAt: true, readAt: true },
        take: 31, orderBy: { id: 'desc' },
      }),
      this.db.systemNotification.count({ where: { ...where, readAt: null } }),
    ]);
    return { items: rows.slice(0, 30), next: rows.length > 30 ? rows[29].id : null, unread };
  }

  async markRead(user: Principal, id: number) {
    const where = { ...visibleTo(user), id };
    const changed = await this.db.systemNotification.updateMany({
      where: { ...where, readAt: null }, data: { readAt: new Date() },
    });
    if (!changed.count && !await this.db.systemNotification.count({ where })) throw new NotFoundException();
  }

  async markAllRead(user: Principal, through: number) {
    await this.db.systemNotification.updateMany({
      where: { ...visibleTo(user), id: { lte: through }, readAt: null }, data: { readAt: new Date() },
    });
  }
}
