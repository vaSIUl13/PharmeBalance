import { createCipheriv, createDecipheriv, createHash, randomBytes, argon2, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ServiceUnavailableException } from '@nestjs/common';

export const sessionCookie = '__Host-pharme-session';
export const challengeCookie = '__Host-pharme-mfa';
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function cookieValue(header: string | undefined, name: string): string | undefined {
  const matches = (header ?? '').split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(name + '='));
  const value = matches.length === 1 ? matches[0].slice(name.length + 1) : '';
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

const derive = promisify(argon2);
let activeHashes = 0;
async function passwordKey(password: string, nonce: Buffer, memory: number, passes: number) {
  if (activeHashes >= 4) throw new ServiceUnavailableException('Password verification busy');
  activeHashes++;
  try {
    return await derive('argon2id', {
      message: Buffer.from(password), nonce, memory, passes, parallelism: 1, tagLength: 32,
    });
  } finally {
    activeHashes--;
  }
}

export const currentHashPrefix = '$argon2id$v=19$m=65536,t=3,p=1$';

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await passwordKey(password, salt, 65536, 3);
  return currentHashPrefix + [salt, key].map((value) => value.toString('base64').replace(/=+$/, '')).join('$');
}

export async function verifyPassword(password: string, hash: string) {
  const match = hash.match(/^\$argon2id\$v=19\$m=(19456|65536),t=([23]),p=1\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/);
  if (!match) return false;
  const [, memory, passes, salt, expected] = match;
  const actual = await passwordKey(password, Buffer.from(salt, 'base64'), Number(memory), Number(passes));
  return timingSafeEqual(actual, Buffer.from(expected, 'base64'));
}

function mfaKey() {
  const key = Buffer.from(process.env.AUTH_MFA_KEY ?? '', 'base64');
  if (key.length !== 32) throw new Error('AUTH_MFA_KEY must be a base64-encoded 32-byte key');
  return key;
}

export function encryptMfa(secret: string, userId: number) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', mfaKey(), iv);
  cipher.setAAD(Buffer.from(String(userId)));
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export function decryptMfa(value: string, userId: number) {
  const bytes = Buffer.from(value, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', mfaKey(), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(String(userId)));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}
