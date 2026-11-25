import { BadRequestException } from '@nestjs/common';

export type DrugCreate = { sku: string; name: string; dosageForm: string; strength: string | null; unit: string };
export type DrugUpdate = Pick<DrugCreate, 'name'>;

function objectWithFields(input: unknown, fields: readonly string[]) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Expected drug data');
  const invalid = Object.keys(input).find(field => !fields.includes(field));
  if (invalid) throw new BadRequestException('Unsupported field: ' + invalid);
  return input as Record<string, unknown>;
}

function text(value: unknown, field: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new BadRequestException('Invalid ' + field);
  }
  return value.trim();
}

export function parseDrugCreate(input: unknown): DrugCreate {
  const body = objectWithFields(input, ['sku', 'name', 'dosageForm', 'strength', 'unit']);
  const sku = text(body.sku, 'SKU', 30).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,29}$/.test(sku) || sku.startsWith('SYN-')) throw new BadRequestException('Invalid SKU');
  return {
    sku, name: text(body.name, 'name', 120), dosageForm: text(body.dosageForm, 'dosageForm', 40),
    unit: text(body.unit, 'unit', 20), strength: body.strength == null ? null : text(body.strength, 'strength', 40),
  };
}

export function parseDrugUpdate(input: unknown): DrugUpdate {
  const body = objectWithFields(input, ['name']);
  return { name: text(body.name, 'name', 120) };
}
