import { BadRequestException } from '@nestjs/common';

export const pharmacyTextFields = { name: 100, city: 60, address: 150 } as const;
export type PharmacyUpdate = Partial<Record<keyof typeof pharmacyTextFields | 'latitude' | 'longitude', string>>;

export function pharmacyText(input: unknown, key: string, limit: number) {
  if (typeof input !== 'string' || !input.trim() || input.trim().length > limit || /[\u0000-\u001f\u007f]/.test(input)) {
    throw new BadRequestException('Invalid ' + key);
  }
  return input.trim();
}

export function pharmacyCoordinate(input: unknown, key: string, max: number) {
  if (typeof input !== 'number' || !Number.isFinite(input) || Math.abs(input) > max) {
    throw new BadRequestException('Invalid ' + key);
  }
  return input.toFixed(6);
}

export function parsePharmacyUpdate(input: unknown): PharmacyUpdate {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length) {
    throw new BadRequestException('Expected at least one pharmacy field');
  }
  const result: PharmacyUpdate = {};
  for (const [field, value] of Object.entries(input)) {
    switch (field) {
      case 'name':
      case 'city':
      case 'address':
        result[field] = pharmacyText(value, field, pharmacyTextFields[field]);
        break;
      case 'latitude':
      case 'longitude':
        result[field] = pharmacyCoordinate(value, field, field === 'latitude' ? 90 : 180);
        break;
      default:
        throw new BadRequestException('Unsupported field: ' + field);
    }
  }
  return result;
}
