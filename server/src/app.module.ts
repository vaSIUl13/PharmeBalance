import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PharmaciesModule } from './modules/pharmacies/pharmacies.module';
import { DrugsModule } from './modules/drugs/drugs.module';
import { ImportsModule } from './modules/imports/imports.module';
import { StocksModule } from './modules/stocks/stocks.module';
import { ForecastsModule } from './modules/forecasts/forecasts.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    PharmaciesModule,
    DrugsModule,
    ImportsModule,
    StocksModule,
    ForecastsModule,
    RecommendationsModule,
    AuditModule,
    NotificationsModule,
    ReportsModule,
  ],
})
export class AppModule {}
