import { HttpException, Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { createClient } from 'redis';
import { digest } from './auth-security';

@Injectable()
export class AuthRedisService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthRedisService.name);
  private readonly client = createClient({
    url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    disableOfflineQueue: true,
    socket: { connectTimeout: 1000, reconnectStrategy: false },
  });
  private connecting?: Promise<unknown>;
  private retryAt = 0;
  private readonly prefix = process.env.AUTH_REDIS_PREFIX ?? 'pharme:auth';

  constructor() {
    this.client.on('error', () => this.logger.warn('Redis connection unavailable'));
  }

  private async ready() {
    if (!this.client.isReady) {
      if (this.retryAt > Date.now()) throw new Error('Redis unavailable');
      this.connecting ??= this.client.connect().catch((error: unknown) => {
        this.retryAt = Date.now() + 1000;
        throw error;
      }).finally(() => { this.connecting = undefined; });
      await this.connecting;
    }
    return this.client;
  }

  async ping() {
    const client = await this.ready();
    await client.withAbortSignal(AbortSignal.timeout(1000)).ping();
  }

  async limit(action: string, subject: string, maximum: number, seconds: number) {
    let count: unknown;
    try {
      count = await (await this.ready()).withAbortSignal(AbortSignal.timeout(1500)).eval(
        "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return n",
        { keys: [this.prefix + ':limit:' + action + ':' + digest(subject)], arguments: [String(seconds)] },
      );
    } catch {
      throw new ServiceUnavailableException('Authentication temporarily unavailable');
    }
    if (Number(count) > maximum) throw new HttpException('Please try again later', 429);
  }

  async isRevoked(hash: string) {
    if (!this.client.isReady) return false;
    try {
      return await this.client.withAbortSignal(AbortSignal.timeout(300)).exists(this.prefix + ':revoked:' + hash) === 1;
    } catch { return false; }
  }

  async rememberRevoked(hashes: string[]) {
    if (hashes.length === 0 || !this.client.isReady) return;
    try {
      const transaction = this.client.multi();
      for (const hash of hashes) transaction.set(this.prefix + ':revoked:' + hash, '1', { EX: 300 });
      await transaction.exec();
    } catch {
      // PostgreSQL enforces revocation even when the cache is unavailable.
    }
  }

  onModuleDestroy() {
    if (this.client.isOpen) this.client.destroy();
  }
}
