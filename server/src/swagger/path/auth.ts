import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

function fields(...names: string[]): MethodDecorator {
  return ApiBody({ schema: {
    type: 'object', required: names,
    properties: Object.fromEntries(names.map((name) => [name, {
      type: 'string', ...(name.toLowerCase().includes('password') ? { format: 'password' } : {}),
    }])),
  } });
}

export const authDocs = {
  controller: ApiTags('auth'),
  login: applyDecorators(
    ApiOperation({ summary: 'Sign in with email and password' }),
    fields('email', 'password'),
  ),
  mfa: applyDecorators(
    ApiOperation({ summary: 'Complete a pending sign-in challenge' }),
    fields('code'),
  ),
  me: ApiOperation({ summary: 'Read the current account and access scope' }),
  sessions: ApiOperation({ summary: 'List sessions for the current account' }),
  revoke: ApiOperation({ summary: 'Revoke one session of the current account' }),
  logout: ApiOperation({ summary: 'End the current session' }),
  logoutAll: ApiOperation({ summary: 'End all sessions for the current account' }),
  change: applyDecorators(
    ApiOperation({ summary: 'Change the current account password' }),
    fields('currentPassword', 'newPassword'),
  ),
  requestReset: applyDecorators(
    ApiOperation({ summary: 'Request a password reset by email' }),
    fields('email'),
  ),
  reset: applyDecorators(
    ApiOperation({ summary: 'Set a new password using a reset token' }),
    fields('token', 'newPassword'),
  ),
};
