import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const roles = ['admin', 'manager', 'head', 'logist'] as const;
type RoleCode = typeof roles[number];

export class UserAccessDto {
  @ApiPropertyOptional({ enum: [...roles] })
  role?: RoleCode;

  @ApiPropertyOptional({ minimum: 1, description: 'Managed pharmacy ID. Required when assigning the head role.' })
  pharmacyId?: number;
}

export class CreateUserDto extends UserAccessDto {
  @ApiProperty({ enum: [...roles] })
  declare role: RoleCode;
  @ApiProperty({ maxLength: 50 }) login!: string;
  @ApiProperty({ format: 'email', maxLength: 100 }) email!: string;
  @ApiProperty({ maxLength: 60 }) firstName!: string;
  @ApiProperty({ maxLength: 60 }) lastName!: string;
  @ApiProperty({ format: 'password', writeOnly: true, minLength: 12, maxLength: 256 }) password!: string;
}

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Expected user data');
  return input as Record<string, unknown>;
}

function stringField(body: Record<string, unknown>, key: string, max: number) {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException('Invalid ' + key);
  return value.trim();
}

export function parseAccess(input: unknown): UserAccessDto {
  const { role, pharmacyId } = record(input);
  if (role === undefined && pharmacyId === undefined) throw new BadRequestException('Provide role or pharmacyId');
  const code = roles.find(value => value === role);
  if (role !== undefined && !code) throw new BadRequestException('Invalid role');
  if (pharmacyId !== undefined && (typeof pharmacyId !== 'number' || !Number.isInteger(pharmacyId) ||
      pharmacyId < 1 || pharmacyId > 2147483647)) throw new BadRequestException('Invalid pharmacyId');
  return { role: code, pharmacyId };
}

export const registrationPasswordMinLength = 8;

export function parseCreate(input: unknown, minimumPasswordLength = 12): CreateUserDto {
  const body = record(input);
  const { role, pharmacyId } = parseAccess(body);
  if (!role) throw new BadRequestException('Role is required');
  const email = stringField(body, 'email', 100).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Invalid email');
  const password = body.password;
  if (typeof password !== 'string' || password.length < minimumPasswordLength || password.length > 256) throw new BadRequestException('Invalid password');
  return { email, password, role, pharmacyId, login: stringField(body, 'login', 50),
    firstName: stringField(body, 'firstName', 60), lastName: stringField(body, 'lastName', 60) };
}
