import type { DataType, SourceFormat } from '@prisma/client';
import { parse } from 'csv-parse/sync';

export const maxBytes = 1024 * 1024;
export const maxRows = 5000;

export type ImportError = { row: number; message: string };
export type ImportRow = { row: number; sku: string; quantity: number; date: string; returnedQuantity: number;
  unitPrice: string | null; replacesImportId: number | null; stockout: boolean | null };
export type ParsedFile = { rows: ImportRow[]; total: number; errors: ImportError[] };

function integer(value: unknown, csv: boolean): number | null {
  if (csv && typeof value === 'string' && /^\d+$/.test(value)) value = Number(value);
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
}

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function snapshotTime(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(value) ||
      !validDate(value.slice(0, 10))) return undefined;
  const date = new Date(value);
  return date.getTime() <= Date.now() ? date : undefined;
}

export function parseFile(bytes: Buffer, format: SourceFormat, type: DataType): ParsedFile {
  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];
  const invalid = (message: string, total = 0): ParsedFile => ({ rows: [], total, errors: [{ row: 0, message }] });
  if (bytes.length > maxBytes) return invalid('File exceeds 1 MiB');
  const csv = format === 'CSV';
  const required = type === 'SALES' ? ['sku', 'quantity', 'date'] : ['sku', 'quantity'];
  const allowed = type === 'SALES' ? [...required, 'returnedQuantity', 'unitPrice', 'replacesImportId', 'stockout'] : required;
  let records: unknown;
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (csv) {
      let count = 0;
      const table: string[][] = parse(source, { skip_empty_lines: true, trim: true, relax_column_count: true,
        on_record: (cells: string[]) => ++count <= maxRows + 1 ? cells : null });
      if (count > maxRows + 1) return invalid('Maximum 5000 records per file', count - 1);
      const headers = table.shift() ?? [];
      if (new Set(headers).size !== headers.length || required.some(key => !headers.includes(key)) ||
          headers.some(key => !allowed.includes(key))) return invalid('Invalid CSV header');
      records = table.map(cells => cells.length === headers.length ? Object.fromEntries(headers.map((key, i) => [key, cells[i]])) : null);
    } else records = JSON.parse(source);
  } catch {
    return invalid('Invalid UTF-8 or malformed ' + format);
  }
  if (!Array.isArray(records) || !records.length) return invalid('Expected a nonempty list of records');
  if (records.length > maxRows) return invalid('Maximum 5000 records per file', records.length);
  const seen = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);
  const entries: unknown[] = records;
  for (const [i, input] of entries.entries()) {
    const row = i + 1;
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) {
      errors.push({ row, message: 'Invalid record structure' }); continue;
    }
    const record = input as Record<string, unknown>;
    const sku: unknown = record.sku;
    const quantity = integer(record.quantity, csv);
    const date: unknown = type === 'SALES' ? record.date : '';
    const returned = record.returnedQuantity;
    const returnedQuantity = returned === undefined || (csv && returned === '') ? 0 : integer(returned, csv);
    const price: unknown = record.unitPrice;
    if (price != null && typeof price !== 'number' && typeof price !== 'string') {
      errors.push({ row, message: 'Invalid unit price' }); continue;
    }
    const unitPrice = price == null || (csv && price === '') ? null : String(price);
    const replacement = record.replacesImportId;
    const hasReplacement = replacement !== undefined && !(csv && replacement === '');
    const replacesImportId = hasReplacement ? integer(replacement, csv) : null;
    if (typeof sku !== 'string' || !sku.trim() || sku !== sku.trim() || sku.length > 30 || /[\u0000\uD800-\uDFFF]/u.test(sku) ||
        quantity === null || returnedQuantity === null || typeof date !== 'string' ||
        (type === 'SALES' && (!validDate(date) || date > today)) ||
        (unitPrice !== null && !/^\d{1,8}(\.\d{1,2})?$/.test(unitPrice)) ||
        (hasReplacement && !replacesImportId)) {
      errors.push({ row, message: 'Invalid SKU, quantity, date, price or correction ID' }); continue;
    }
    const key = JSON.stringify([sku, date]);
    if (seen.has(key)) { errors.push({ row, message: 'Duplicate SKU and date in file' }); continue; }
    seen.add(key);
    const flag = record.stockout;
    const stockout = csv && flag === 'true' ? true : csv && flag === 'false' ? false : flag;
    if (stockout != null && !(csv && stockout === '') && typeof stockout !== 'boolean') {
      errors.push({ row, message: 'Invalid stockout flag' }); continue;
    }
    rows.push({ row, sku, quantity, date, returnedQuantity, unitPrice, replacesImportId,
      stockout: typeof stockout === 'boolean' ? stockout : null });
  }
  return { total: records.length, rows, errors };
}
