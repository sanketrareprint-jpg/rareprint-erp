// backend/src/dashboard/dashboard.module.ts
import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CostTableModule } from '../cost-table/cost-table.module';
import { MarketingRoiModule } from '../marketing-roi/marketing-roi.module';

@Module({
  imports: [PrismaModule, CostTableModule, MarketingRoiModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}