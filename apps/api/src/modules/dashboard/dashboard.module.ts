import { Module } from '@nestjs/common';
import { MembershipsModule } from '../memberships/memberships.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [MembershipsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
