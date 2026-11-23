import { ApiOperation, ApiTags } from '@nestjs/swagger';

export const rolesDocs = {
  controller: ApiTags('users'),
  list: ApiOperation({ summary: 'List account roles and their data scopes' }),
};
