// backend/src/dashboard/dashboard.module.ts
import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CostTableModule } from '../cost-table/cost-table.module';

@Module({
  imports: [PrismaModule, CostTableModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}