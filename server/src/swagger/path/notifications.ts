import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

export const notificationsDocs = {
  controller: ApiTags('notifications'),
  failed: applyDecorators(
    ApiQuery({ name: 'after', required: false, type: Number }),
    ApiOperation({ summary: 'List failed deliveries for administrators' }),
  ),
  retry: ApiOperation({ summary: 'Requeue one failed delivery for administrators' }),
};
