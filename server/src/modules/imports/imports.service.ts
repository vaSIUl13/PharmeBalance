import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type DataType, Prisma, type SourceFormat } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { Principal } from '../auth/auth.service';
import { lockUser } from '../users/pharmacy-assignments';
import { parseFile, type ImportError, type ImportRow } from './import-file';

type Upload = { pharmacyId: number; dataType: DataType; sourceFormat: SourceFormat; snapshotAt?: Date;
  fileName: string; buffer: Buffer };
type Position = { stockId: number; sku: string; quantity: number; asOf: Date };
type SaleInput = ImportRow & { stockId: number };
type PreviousSale = { stockId: number; date: string; quantity: number; returnedQuantity: number;
  unitPrice: Prisma.Decimal | null; importId: number };

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

function saleKey(stockId: number, date: string) { return stockId + '/' + date; }

async function changedSales(tx: Prisma.TransactionClient, rows: SaleInput[], errors: ImportError[]) {
  if (!rows.length) return [];
  const previous = await tx.$queryRaw<PreviousSale[]>`
    SELECT s.stock_id AS "stockId", to_char(s.sale_date, 'YYYY-MM-DD') AS date, s.quantity,
           s.returned_quantity AS "returnedQuantity", s.unit_price AS "unitPrice", s.import_id AS "importId"
    FROM sale s JOIN jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r("stockId" int, date date)
      ON s.stock_id = r."stockId" AND s.sale_date = r.date`;
  const existing = new Map(previous.map(s => [saleKey(s.stockId, s.date), s]));
  return rows.filter(row => {
    const old = existing.get(saleKey(row.stockId, row.date));
    if (row.replacesImportId !== null && old?.importId !== row.replacesImportId) {
      errors.push({ row: row.row, message: 'Correction refers to an outdated or missing aggregate' }); return false;
    }
    if (!old) return true;
    const samePrice = old.unitPrice === null ? row.unitPrice === null : row.unitPrice !== null && old.unitPrice.equals(row.unitPrice);
    if (old.quantity === row.quantity && old.returnedQuantity === row.returnedQuantity && samePrice) return false;
    if (row.replacesImportId === null) {
      errors.push({ row: row.row, message: 'Correction requires replacesImportId=' + old.importId }); return false;
    }
    return true;
  });
}

@Injectable()
export class ImportsService {
  constructor(private readonly db: PrismaService) {}

  private scope(user: Principal): Prisma.ImportBatchWhereInput {
    if (user.role !== 'head') throw new ForbiddenException();
    return { pharmacyId: { in: user.pharmacyIds }, assignment: { pharmacy: {
      userPharmacyRows: { some: { userId: user.userId, unassignedAt: null } },
    } } };
  }

  async history(user: Principal, before?: number) {
    const rows = await this.db.importBatch.findMany({
      where: { ...this.scope(user), importId: before ? { lt: before } : undefined },
      orderBy: { importId: 'desc' }, take: 51, omit: { errors: true, requestKey: true },
    });
    return { items: rows.slice(0, 50), next: rows.length > 50 ? rows[49].importId : null };
  }

  async detail(user: Principal, importId: number) {
    const batch = await this.db.importBatch.findFirst({ where: { ...this.scope(user), importId }, omit: { requestKey: true } });
    if (!batch) throw new NotFoundException('Import not found');
    return batch;
  }

  async upload(user: Principal, upload: Upload) {
    const { pharmacyId, dataType, sourceFormat, snapshotAt, fileName, buffer } = upload;
    if (user.role !== 'head' || !user.pharmacyIds.includes(pharmacyId)) throw new ForbiddenException();
    const checksum = sha256(buffer);
    const requestKey = sha256(JSON.stringify([pharmacyId, dataType, sourceFormat, snapshotAt, checksum]));
    const file = parseFile(buffer, sourceFormat, dataType);
    return this.db.$transaction(async tx => {
      await lockUser(tx, user.userId);
      const assigned = await tx.userPharmacy.findFirst({ where: { userId: user.userId, pharmacyId, unassignedAt: null,
        user: { isActive: true, role: { code: 'head', rolePermissionRows: { some: { permission: { code: 'DATA_IMPORT' } } } } } } });
      if (!assigned) throw new ForbiddenException();
      await tx.$queryRaw`SELECT pharmacy_id FROM pharmacy WHERE pharmacy_id = ${pharmacyId} FOR UPDATE`;
      const repeat = await tx.importBatch.findUnique({ where: { requestKey }, omit: { requestKey: true } });
      if (repeat) return repeat;
      const skus = [...new Set(file.rows.map(row => row.sku))];
      const positions = skus.length ? await tx.$queryRaw<Position[]>`
        SELECT s.stock_id AS "stockId", d.sku, s.quantity, s.quantity_as_of AS "asOf"
        FROM stock_item s JOIN drug d ON s.drug_id = d.drug_id
        WHERE s.pharmacy_id = ${pharmacyId} AND d.sku IN (${Prisma.join(skus)})
        ORDER BY s.stock_id FOR UPDATE OF s` : [];
      const bySku = new Map(positions.map(stock => [stock.sku, stock]));
      const errors = [...file.errors];
      let changes: SaleInput[] = [];
      for (const row of file.rows) {
        const stock = bySku.get(row.sku);
        if (!stock) { errors.push({ row: row.row, message: 'Unknown stock SKU in this pharmacy' }); continue; }
        if (snapshotAt) {
          if (snapshotAt < stock.asOf || (+snapshotAt === +stock.asOf && stock.quantity !== row.quantity)) {
            errors.push({ row: row.row, message: 'Stale or conflicting stock snapshot' }); continue;
          }
          if (+snapshotAt === +stock.asOf) continue;
        }
        changes.push({ ...row, stockId: stock.stockId });
      }
      if (dataType === 'SALES') changes = await changedSales(tx, changes, errors);
      const batch = await tx.importBatch.create({ data: { pharmacyId, uploadedBy: user.userId, dataType, sourceFormat,
        fileName, checksum, requestKey, snapshotAt, recordsTotal: file.total,
        recordsRejected: errors.some(error => error.row === 0) ? file.total : errors.length,
        recordsApplied: errors.length ? 0 : changes.length, errors, status: errors.length ? 'REJECTED' : 'APPLIED' },
        omit: { requestKey: true } });
      if (errors.length || !changes.length) return batch;
      const payload = JSON.stringify(changes);
      if (dataType === 'STOCKS') {
        await tx.$executeRaw`UPDATE stock_item s SET quantity = r.quantity, quantity_as_of = ${snapshotAt}, updated_at = clock_timestamp()
          FROM jsonb_to_recordset(${payload}::jsonb) AS r("stockId" int, quantity int) WHERE s.stock_id = r."stockId"`;
      } else {
        await tx.$executeRaw`INSERT INTO sale(stock_id, sale_date, quantity, returned_quantity, unit_price, source_row, import_id)
          SELECT "stockId", date, quantity, "returnedQuantity", "unitPrice", row, ${batch.importId}
          FROM jsonb_to_recordset(${payload}::jsonb) AS r("stockId" int, date date, quantity int,
            "returnedQuantity" int, "unitPrice" numeric, row int)
          ON CONFLICT (stock_id, sale_date) DO UPDATE SET quantity = excluded.quantity,
            returned_quantity = excluded.returned_quantity, unit_price = excluded.unit_price,
            source_row = excluded.source_row, import_id = excluded.import_id`;
      }
      return batch;
    }, { timeout: 30000 });
  }
}
