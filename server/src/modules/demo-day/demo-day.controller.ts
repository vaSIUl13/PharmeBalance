import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, HttpCode, Post, Req } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { demoDayDocs } from '../../swagger/path/demo-day';
import type { AuthRequest } from '../auth/auth.guard';
import { loadForecastPolicy } from '../forecasts/forecast-policy';
import { validDate } from '../imports/import-file';
import { closeDemoDay, isDemoDatabase, latestDemoDay } from './demo-close';
import { closedThrough, kyivDate, nextDay } from './demo-report';

@demoDayDocs.controller
@Controller('demo-day')
export class DemoDayController {
  constructor(private readonly db: PrismaService) {}

  @demoDayDocs.status
  @Get()
  @Header('Cache-Control', 'no-store')
  async status(@Req() request: AuthRequest) {
    if (request.principal?.role !== 'superadmin') throw new ForbiddenException();
    const enabled = isDemoDatabase(process.env.DATABASE_URL);
    const latestDay = enabled ? await latestDemoDay(this.db) : null;
    const now = new Date();
    return { enabled, latestDay, nextDay: latestDay ? nextDay(latestDay) : null, today: kyivDate(now).date,
      scheduledThrough: closedThrough(now), automatic: enabled && process.env.DEMO_AUTO_CLOSE === 'true' };
  }

  @demoDayDocs.close
  @Post()
  @HttpCode(200)
  close(@Req() request: AuthRequest, @Body() body: unknown) {
    if (request.principal?.role !== 'superadmin' || !isDemoDatabase(process.env.DATABASE_URL)) throw new ForbiddenException();
    if (!body || typeof body !== 'object' || !('day' in body) || !validDate(body.day)) {
      throw new BadRequestException('Expected a valid day (YYYY-MM-DD)');
    }
    return closeDemoDay(this.db, { through: kyivDate(new Date()).date, expected: body.day, policy: loadForecastPolicy() });
  }
}
