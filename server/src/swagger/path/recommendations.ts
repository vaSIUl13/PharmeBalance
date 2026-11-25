import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { commands } from '../../modules/recommendations/recommendations.service';
import { TransferInput } from '../../modules/recommendations/transfer-input';

export const recommendationsDocs = {
  controller: ApiTags('recommendations'),
  list: applyDecorators(
    ApiOperation({ summary: 'List redistribution recommendations visible to the current user',
      description: 'Manager results include donor and recipient stock details.' }),
    ApiQuery({ name: 'after', required: false, type: Number, description: 'Last recommendation ID of the previous page' }),
    ApiQuery({ name: 'notificationId', required: false, type: Number, description: 'List detailed recommendations from a batch notification owned by the manager' }),
  ),
  detail: ApiOperation({ summary: 'Recommendation with endpoints, donor distance and uncovered quantity' }),
  route: applyDecorators(
    ApiOperation({ summary: 'Get the driving route and estimated time between the pharmacies of a visible transfer' }),
    ApiNotFoundResponse({ description: 'Transfer does not exist or is outside the caller’s scope' }),
    ApiOkResponse({ schema: { oneOf: [
      { type: 'object', required: ['status', 'distanceMeters', 'durationSeconds', 'coordinates'], properties: {
        status: { type: 'string', enum: ['ready'] }, distanceMeters: { type: 'number' }, durationSeconds: { type: 'number' },
        coordinates: { type: 'array', items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
          description: 'LineString positions ordered longitude, latitude' },
      } },
      { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['no-route', 'unavailable'] } } },
    ] } }),
  ),
  history: ApiOperation({ summary: 'List transfer actions, actors, quantities and status transitions' }),
  generate: ApiOperation({ summary: 'Evaluate unresolved shortage positions in a forecast run' }),
  act: applyDecorators(
    ApiConflictResponse({ description: 'Invalid transition, stale suggestion, or unavailable reservation' }),
    ApiBody({ type: TransferInput, required: false }),
    ApiParam({ name: 'command', enum: [...commands] }),
    ApiOperation({ summary: 'Apply a transfer action idempotently', description: 'CONFIRM reserves; DISPATCH preserves the reservation; RECEIVE moves both physical balances.' }),
  ),
};
