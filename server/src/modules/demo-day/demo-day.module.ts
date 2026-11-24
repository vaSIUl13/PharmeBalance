import { Module } from '@nestjs/common';
import { DemoDayController } from './demo-day.controller';

@Module({ controllers: [DemoDayController] })
export class DemoDayModule {}
