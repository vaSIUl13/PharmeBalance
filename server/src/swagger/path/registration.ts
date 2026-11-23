import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { registrationPasswordMinLength } from '../../modules/users/dto/user-input';

export const registrationDocs = {
  controller: ApiTags('registration'),
  submit: applyDecorators(ApiOperation({ summary: 'Submit a registration request for reviewer approval' }), ApiBody({ schema: {
    type: 'object',
    required: ['firstName', 'lastName', 'email', 'login', 'password', 'role', 'consent'],
    properties: {
      firstName: { type: 'string', maxLength: 60 }, lastName: { type: 'string', maxLength: 60 },
      email: { type: 'string', format: 'email', maxLength: 100 },
      login: { type: 'string', pattern: '^[A-Za-z0-9.]{4,50}$' },
      password: { type: 'string', format: 'password', minLength: registrationPasswordMinLength, maxLength: 256, writeOnly: true },
      role: { type: 'string', enum: ['admin', 'logist', 'manager', 'head'] },
      consent: { type: 'boolean' },
    },
  } })),
  pending: ApiOperation({ summary: 'List pending registration requests as the configured reviewer' }),
  detail: ApiOperation({ summary: 'Review a registration request' }),
  approve: ApiOperation({ summary: 'Approve a request and provision its account' }),
  reject: ApiOperation({ summary: 'Reject a request without provisioning an account' }),
  approval: ApiBody({ required: false, schema: { type: 'object', properties: {
    pharmacyId: { type: 'integer', minimum: 1, description: 'Required for HEAD, optional for LOGISTICIAN' },
  } } }),
};
