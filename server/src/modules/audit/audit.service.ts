import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly db: PrismaService) {}

  async list(before?: number, targetUserId?: number) {
    const rows = await this.db.auditLog.findMany({
      where: { targetUserId, ...(before === undefined ? {} : { logId: { lt: before } }) },
      orderBy: { logId: 'desc' }, take: 51,
    });
    return { items: rows.slice(0, 50), next: rows.length > 50 ? rows[49].logId : null };
  }
}
