const database = new URL(process.env.DEMO_DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) || !database.pathname.endsWith('_demo')) {
  throw Error('Use a local _demo database');
}
process.env.DATABASE_URL = database.href;
process.env.EMAIL_ENABLED = 'false';
process.env.AUTH_SMTP_URL = '';
process.env.AUTH_REDIS_PREFIX = 'pharme:demo';
void import('../main.js');
