import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const integerMax = 2147483647;
const level = { type: 'integer', minimum: 0, maximum: integerMax } as const;

export class CreateStockDto {
  @ApiProperty({ ...level, minimum: 1 }) pharmacyId!: number;
  @ApiProperty({ maxLength: 30, example: 'CAT-SAMPLE-0001' }) sku!: string;
  @ApiPropertyOptional({ ...level, default: 0 }) quantity?: number;
  @ApiProperty(level) msl!: number;
  @ApiProperty(level) maxLevel!: number;
}

export class StockThresholdsDto {
  @ApiPropertyOptional(level) msl?: number;
  @ApiPropertyOptional(level) maxLevel?: number;
}

function fields(input: unknown, allowed: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !allowed.includes(key))) throw new BadRequestException('Invalid stock fields');
  return input as Record<string, unknown>;
}

function integer(value: unknown, name: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > integerMax) {
    throw new BadRequestException('Invalid ' + name);
  }
  return value;
}

export function stockSku(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 30) throw new BadRequestException('Invalid sku');
  return value.trim();
}

export function validateLevels(msl: number, maxLevel: number) {
  if (msl > maxLevel) throw new BadRequestException('MSL must not exceed Max');
}

export function createStockInput(input: unknown): CreateStockDto {
  const body = fields(input, ['pharmacyId', 'sku', 'quantity', 'msl', 'maxLevel']);
  const msl = integer(body.msl, 'msl');
  const maxLevel = integer(body.maxLevel, 'maxLevel');
  validateLevels(msl, maxLevel);
  return { pharmacyId: integer(body.pharmacyId, 'pharmacyId', 1), sku: stockSku(body.sku),
    quantity: body.quantity === undefined ? 0 : integer(body.quantity, 'quantity'), msl, maxLevel };
}

export function stockThresholdsInput(input: unknown): StockThresholdsDto {
  const body = fields(input, ['msl', 'maxLevel']);
  if (body.msl === undefined && body.maxLevel === undefined) throw new BadRequestException('Provide msl or maxLevel');
  return { msl: body.msl === undefined ? undefined : integer(body.msl, 'msl'),
    maxLevel: body.maxLevel === undefined ? undefined : integer(body.maxLevel, 'maxLevel') };
}
