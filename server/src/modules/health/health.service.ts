import { Injectable } from '@nestjs/common';
import type { HealthResponseDto } from './dto/health-response.dto';

@Injectable()
export class HealthService {
  check(): HealthResponseDto {
    return { status: 'ok' };
  }
}
