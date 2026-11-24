import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

export const rolesDocs = {
  controller: ApiTags('users'),
  list: ApiOperation({ summary: 'List account roles with their data scopes and permissions' }),
  catalog: ApiOperation({ summary: 'List permissions and roles eligible for each grant' }),
  set: applyDecorators(
    ApiOperation({ summary: 'Grant or revoke a role permission as superadministrator' }),
    ApiBody({ schema: { type: 'object', required: ['granted'], properties: { granted: { type: 'boolean' } } } }),
    ApiForbiddenResponse({ description: 'Superadmin required, or the role/permission combination is protected' }),
  ),
};
