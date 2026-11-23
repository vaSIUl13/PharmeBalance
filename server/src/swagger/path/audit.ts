import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

export const auditDocs = {
  controller: ApiTags('audit'),
  list: applyDecorators(
    ApiQuery({ name: 'targetUserId', required: false, type: Number }),
    ApiQuery({ name: 'before', required: false, type: Number, description: 'Pass next from the previous page' }),
    ApiOperation({ summary: 'Read business audit events, newest entries first' }),
  ),
};
