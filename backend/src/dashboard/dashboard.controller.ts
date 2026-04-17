// backend/src/dashboard/dashboard.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  getStats() { return this.dashboardService.getStats(); }

  @Get('agent-leaderboard')
  getAgentLeaderboard() { return this.dashboardService.getAgentLeaderboard(); }

  @Get('category-stage-quantities')
  getCategoryStageQuantities() { return this.dashboardService.getCategoryStageQuantities(); }

  @Get('avg-production-time')
  getAvgProductionTime() { return this.dashboardService.getAvgProductionTime(); }

  @Get('lead-source-analytics')
  getLeadSourceAnalytics() { return this.dashboardService.getLeadSourceAnalytics(); }
}