import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { commands } from '../../modules/recommendations/recommendations.service';
import { TransferInput } from '../../modules/recommendations/transfer-input';

export const recommendationsDocs = {
  controller: ApiTags('recommendations'),
  list: applyDecorators(
    ApiOperation({ summary: 'List redistribution recommendations visible to the current user' }),
    ApiQuery({ name: 'after', required: false, type: Number, description: 'Last recommendation ID of the previous page' }),
  ),
  detail: ApiOperation({ summary: 'Recommendation with endpoints, donor distance and uncovered quantity' }),
  history: ApiOperation({ summary: 'List transfer actions, actors, quantities and status transitions' }),
  generate: ApiOperation({ summary: 'Evaluate shortage positions in a forecast run once' }),
  act: applyDecorators(
    ApiConflictResponse({ description: 'Invalid transition, stale suggestion, or unavailable reservation' }),
    ApiBody({ type: TransferInput, required: false }),
    ApiParam({ name: 'command', enum: [...commands] }),
    ApiOperation({ summary: 'Apply a transfer action idempotently', description: 'CONFIRM reserves; DISPATCH preserves the reservation; RECEIVE moves both physical balances.' }),
  ),
};
