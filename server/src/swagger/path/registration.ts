import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { minPasswordLength } from '../../modules/auth/auth-security';

const review = (summary: string) => applyDecorators(ApiOperation({ summary }),
  ApiForbiddenResponse({ description: 'Requires the superadmin role and REGISTRATION_REVIEW permission' }));

export const registrationDocs = {
  controller: ApiTags('registration'),
  submit: applyDecorators(ApiOperation({ summary: 'Submit a registration request for reviewer approval' }), ApiBody({ schema: {
    type: 'object',
    required: ['firstName', 'lastName', 'email', 'login', 'password', 'role', 'consent'],
    properties: {
      firstName: { type: 'string', maxLength: 60 }, lastName: { type: 'string', maxLength: 60 },
      email: { type: 'string', format: 'email', maxLength: 100 },
      login: { type: 'string', pattern: '^[A-Za-z0-9.]{4,50}$' },
      password: { type: 'string', format: 'password', minLength: minPasswordLength, maxLength: 256, writeOnly: true },
      role: { type: 'string', enum: ['admin', 'logist', 'manager', 'head'] },
      consent: { type: 'boolean' },
    },
  } })),
  pending: review('List pending registration requests'),
  detail: review('Review a registration request'),
  approve: review('Approve a request and provision its account'),
  reject: review('Reject a request without provisioning an account'),
  approval: ApiBody({ required: false, schema: { type: 'object', properties: {
    pharmacyId: { type: 'integer', minimum: 1, description: 'Required for HEAD, optional for LOGISTICIAN' },
  } } }),
};
