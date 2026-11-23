import { BadRequestException, type PipeTransform } from '@nestjs/common';

export function optionalQueryId(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647) {
    throw new BadRequestException('Invalid ' + name);
  }
  return Number(value);
}

export class DatabaseIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const id = optionalQueryId(value, 'id');
    if (id === undefined) throw new BadRequestException('Missing id');
    return id;
  }
}
