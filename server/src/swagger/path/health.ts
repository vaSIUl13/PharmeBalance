import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { HealthResponseDto } from '../../modules/health/dto/health-response.dto';

export const healthDocs = {
  controller: ApiTags('health'),
  check: applyDecorators(
    ApiOperation({ summary: 'Read API liveness' }),
    ApiOkResponse({ type: HealthResponseDto }),
  ),
  ready: applyDecorators(
    ApiOperation({ summary: 'Check API readiness for PostgreSQL and Redis' }),
    ApiOkResponse({ type: HealthResponseDto }),
    ApiServiceUnavailableResponse({
      description: 'At least one dependency failed its readiness probe',
      schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['unavailable'] } } },
    }),
  ),
};
