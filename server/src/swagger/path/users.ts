import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CreateUserDto, UserAccessDto } from '../../modules/users/dto/user-input';

export const usersDocs = {
  controller: ApiTags('users'),
  list: applyDecorators(
    ApiQuery({ name: 'after', required: false, type: Number, description: 'Pass next from the previous page' }),
    ApiOperation({ summary: 'List accounts, roles and current pharmacy assignments' }),
  ),
  create: applyDecorators(
    ApiBody({ type: CreateUserDto }),
    ApiOperation({ summary: 'Create an account with a role. A head requires a managed pharmacy ID.' }),
  ),
  update: applyDecorators(
    ApiBody({ type: UserAccessDto }),
    ApiOperation({ summary: 'Change role or assign a pharmacy. Assigning a head activates the pharmacy.' }),
  ),
  block: ApiOperation({ summary: 'Block a user account' }),
};
