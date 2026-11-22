import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmailService } from './email.service';
import { transferEmail } from './transfer-email';

const context = { action: { include: { actionType: true, recommendation: {
  include: { donorStock: true, recipientStock: true, recommendationActionRows: {
    where: { actionType: { code: 'CONFIRM' } }, select: { userId: true },
  } },
} } } } satisfies Prisma.EmailEventInclude;
type Event = Prisma.EmailEventGetPayload<{ include: typeof context }>;
const recipientRoles: Record<string, ('logist' | 'head' | 'manager')[]> = {
  CONFIRM: ['logist'], DISPATCH: ['head'], RECEIVE: ['manager'], REJECT: ['manager'], CANCEL: ['logist', 'manager'],
};

function audience(event: Event): Prisma.UserAccountWhereInput {
  const { action } = event;
  const transfer = action.recommendation;
  const code = action.actionType.code;
  const match = (role: string, permissions: string[], pharmacyId?: number, userId?: number): Prisma.UserAccountWhereInput => ({
    userId, ...(pharmacyId === undefined ? {} : { userPharmacyRows: { some: { pharmacyId, unassignedAt: null } } }),
    role: { code: role, AND: permissions.map(code => ({ rolePermissionRows: { some: { permission: { code } } } })) },
  });
  const logist = match('logist', ['PHARMACY_VIEW', 'TRANSFER_VIEW', 'TRANSFER_DISPATCH'], transfer.donorStock.pharmacyId);
  const head = match('head', ['PHARMACY_VIEW', 'RECEIPT_CONFIRM'], transfer.recipientStock.pharmacyId);
  const owner = code === 'REJECT' ? action.userId : transfer.recommendationActionRows[0]?.userId;
  const manager = owner === undefined ? { userId: { in: [] } } : match('manager', ['NETWORK_VIEW'], undefined, owner);
  const rules = { logist, head, manager } satisfies Record<string, Prisma.UserAccountWhereInput>;
  const roles = recipientRoles[code] ?? [];
  return { isActive: true, OR: roles.map(role => rules[role]) };
}

const maxAttempts = 5;
const mailbox = /^[^\s@<>\x00-\x1f]+@[^\s@<>\x00-\x1f]+\.[^\s@<>\x00-\x1f]+$/;
const statusLabels: Record<string, string> = {
  CONFIRMED: 'Підтверджена', REJECTED: 'Відхилена', CANCELLED: 'Скасована',
  IN_PROGRESS: 'У виконанні', COMPLETED: 'Виконана',
};

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private timer?: NodeJS.Timeout;
  private pending?: Promise<void>;
  private stopped = false;

  constructor(private readonly db: PrismaService, private readonly email: EmailService) {}

  onModuleInit() {
    if (this.email.enabled) this.schedule(0);
  }

  async onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.pending;
  }

  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.pending = this.tick();
    }, delay).unref();
  }

  private async tick() {
    let worked = false;
    try {
      worked = await this.processOne();
    } catch {
      this.logger.warn('Outbox processing failed; will retry');
    } finally {
      this.schedule(worked ? 0 : 2000);
    }
  }

  private prepare() {
    return this.db.$transaction(async tx => {
      const [claim] = await tx.$queryRaw<{ actionId: number }[]>`SELECT action_id AS "actionId" FROM email_event
        WHERE prepared_at IS NULL ORDER BY action_id LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!claim) return false;
      const event = await tx.emailEvent.findUniqueOrThrow({ where: claim, include: context });
      const users = await tx.userAccount.findMany({ where: audience(event), select: {
        userId: true, email: true, role: { select: { code: true } },
      },
        orderBy: { userId: 'asc' } });
      const seen = new Set<string>();
      const foundRoles = new Set<string>();
      const deliveries: Prisma.EmailDeliveryCreateManyInput[] = [];
      for (const user of users) {
        const email = user.email.trim().toLowerCase();
        if (!mailbox.test(email)) continue;
        foundRoles.add(user.role.code);
        if (seen.has(email)) continue;
        seen.add(email);
        deliveries.push({ actionId: claim.actionId, userId: user.userId });
      }
      if (deliveries.length) await tx.emailDelivery.createMany({ data: deliveries });
      const missingRoles = (recipientRoles[event.action.actionType.code] ?? []).filter(role => !foundRoles.has(role));
      await tx.emailEvent.update({ where: claim, data: { preparedAt: new Date(), recipientCount: deliveries.length, missingRoles } });
      return true;
    });
  }

  async processOne() {
    if (!this.email.enabled) return false;
    const prepared = await this.prepare();
    const sent = await this.db.$transaction(async tx => {
      const [claim] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM email_delivery WHERE accepted_at IS NULL
        AND failed_at IS NULL AND skipped_at IS NULL AND next_attempt_at <= now()
        ORDER BY next_attempt_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!claim) return false;
      const delivery = await tx.emailDelivery.findUniqueOrThrow({ where: claim, include: { event: { include: context } } });
      const user = await tx.userAccount.findFirst({ where: { AND: [{ userId: delivery.userId }, audience(delivery.event)] },
        select: { email: true } });
      if (!user || !mailbox.test(user.email.trim())) {
        await tx.emailDelivery.update({ where: claim, data: { skippedAt: new Date(), lastError: 'RECIPIENT_UNAVAILABLE' } });
        return true;
      }
      const { action, ...event } = delivery.event;
      const attempts = delivery.attempts + 1;
      const message = transferEmail({ ...event, code: action.actionType.code, time: action.actionTime,
        quantity: action.quantity ?? action.recommendation.quantity, recommendationId: action.recommendationId,
        status: statusLabels[action.actionType.toStatus] });
      let data: Prisma.EmailDeliveryUpdateInput;
      try {
        await this.email.send(user.email.trim(), delivery.id, message);
        data = { acceptedAt: new Date(), attempts, lastError: null };
      } catch (error) {
        const smtp = error as { responseCode?: number; code?: string } | null;
        const responseCode = smtp?.responseCode;
        const lastError = Number.isInteger(responseCode) ? 'SMTP_' + responseCode :
          smtp?.code && /^[A-Z_]{2,25}$/.test(smtp.code) ? smtp.code : 'SMTP_SEND_FAILED';
        data = { attempts, lastError,
          ...(attempts >= maxAttempts || (responseCode !== undefined && responseCode >= 500)
            ? { failedAt: new Date() } : { nextAttemptAt: new Date(Date.now() + 30_000 * 2 ** (attempts - 1)) }),
        };
      }
      await tx.emailDelivery.update({ where: claim, data });
      return true;
    }, { timeout: 60000 });
    return prepared || sent;
  }

  async retryFailed(id: number) {
    const result = await this.db.emailDelivery.updateMany({ where: { id, failedAt: { not: null },
      acceptedAt: null, skippedAt: null },
      data: { failedAt: null, attempts: 0, nextAttemptAt: new Date() } });
    return result.count > 0;
  }
}
