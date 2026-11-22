import { BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TransferInput {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, example: 12, description: 'Required for RECEIVE. Must equal the dispatched amount.' })
  quantity?: number;

  @ApiPropertyOptional({ maxLength: 300 })
  comment?: string;
}

export function parseTransferInput(input: unknown): TransferInput {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => key !== 'quantity' && key !== 'comment')) {
    throw new BadRequestException('Invalid action body');
  }
  const { quantity, comment } = input as Record<string, unknown>;
  if (quantity !== undefined && (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647)) {
    throw new BadRequestException('Invalid quantity');
  }
  if (comment !== undefined && (typeof comment !== 'string' || comment.length > 300 || /[\u0000\uD800-\uDFFF]/u.test(comment))) {
    throw new BadRequestException('Invalid comment');
  }
  return { quantity, comment };
}
