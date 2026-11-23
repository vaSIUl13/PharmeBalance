import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthResponseDto } from '../../modules/health/dto/health-response.dto';

export const healthDocs = {
  controller: ApiTags('health'),
  check: applyDecorators(
    ApiOperation({ summary: 'Read service health' }),
    ApiOkResponse({ type: HealthResponseDto }),
  ),
};
