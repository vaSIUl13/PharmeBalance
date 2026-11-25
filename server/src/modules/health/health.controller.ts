import { Public } from '../auth/auth.guard';
import { Controller, Get, Header } from '@nestjs/common';
import { healthDocs } from '../../swagger/path/health';
import { HealthResponseDto } from './dto/health-response.dto';
import { HealthService } from './health.service';

@healthDocs.controller
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @healthDocs.check
  @Public()
  @Get()
  check(): HealthResponseDto {
    return this.healthService.check();
  }

  @healthDocs.ready
  @Public()
  @Header('Cache-Control', 'no-store')
  @Get('ready')
  ready(): Promise<HealthResponseDto> {
    return this.healthService.ready();
  }
}
