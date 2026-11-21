export function validateAuthConfig() {
  const origin = new URL(process.env.AUTH_ORIGIN ?? 'http://localhost:3000');
  if (process.env.AUTH_ORIGIN && process.env.AUTH_ORIGIN !== origin.origin) {
    throw new Error('AUTH_ORIGIN must be an origin without a path or trailing slash');
  }
  if (process.env.NODE_ENV !== 'production') return;
  if (!process.env.AUTH_ORIGIN || origin.protocol !== 'https:') throw new Error('AUTH_ORIGIN must use HTTPS');
  const redis = new URL(process.env.REDIS_URL ?? '');
  if (redis.protocol !== 'rediss:') throw new Error('REDIS_URL must use TLS in production');
  if (Buffer.from(process.env.AUTH_MFA_KEY ?? '', 'base64').length !== 32) {
    throw new Error('AUTH_MFA_KEY must contain a base64-encoded 32-byte key');
  }
  const smtp = new URL(process.env.AUTH_SMTP_URL ?? '');
  if (!['smtp:', 'smtps:'].includes(smtp.protocol) || !process.env.AUTH_MAIL_FROM) {
    throw new Error('Configure SMTP and AUTH_MAIL_FROM for password recovery');
  }
}
