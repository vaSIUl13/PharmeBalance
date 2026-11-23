import type { TestContext } from 'node:test';

import nodemailer = require('nodemailer');

export async function captureResetMail(t: TestContext, requestReset: () => Promise<void>): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  t.mock.method(nodemailer, 'createTransport', () => ({
    async sendMail(message: { text: string }) {
      resolve(message.text);
    },
  }));
  const previousFrom = process.env.AUTH_MAIL_FROM;
  process.env.AUTH_SMTP_URL = 'smtp://unused.invalid';
  process.env.AUTH_MAIL_FROM = 'test@example.invalid';
  const timeout = setTimeout(() => reject(new Error('Missing password reset message')), 8000);
  try {
    const [, message] = await Promise.all([requestReset(), promise]);
    return message;
  } finally {
    clearTimeout(timeout);
    delete process.env.AUTH_SMTP_URL;
    if (previousFrom === undefined) delete process.env.AUTH_MAIL_FROM;
    else process.env.AUTH_MAIL_FROM = previousFrom;
  }
}
