import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuthRedisService } from '../auth/auth-redis.service';
import type { HealthResponseDto } from './dto/health-response.dto';

const readinessDeadlineMs = 2000;

@Injectable()
export class HealthService {
  private pending?: Promise<boolean>;

  constructor(private readonly db: PrismaService, private readonly redis: AuthRedisService) {}

  check(): HealthResponseDto {
    return { status: 'ok' };
  }

  async ready(): Promise<HealthResponseDto> {
    this.pending ??= Promise.allSettled([this.db.ping(), this.redis.ping()])
      .then(results => results.every(result => result.status === 'fulfilled'))
      .finally(() => { this.pending = undefined; });

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false), readinessDeadlineMs); });
      if (!await Promise.race([this.pending, deadline])) {
        throw new ServiceUnavailableException({ status: 'unavailable' });
      }
      return this.check();
    } finally {
      clearTimeout(timeout);
    }
  }
}
