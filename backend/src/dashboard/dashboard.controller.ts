// backend/src/dashboard/dashboard.controller.ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { DashboardService } from './dashboard.service';

type JwtUser = { id: string; role: string; email: string };

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(@Req() req: Request & { user: JwtUser }) {
    return this.dashboardService.getSummary(req.user?.email, req.user?.role);
  }

  @Get('stats')
  getStats() { return this.dashboardService.getStats(); }

  @Get('agent-leaderboard')
  getAgentLeaderboard() { return this.dashboardService.getAgentLeaderboard(); }

  @Get('category-stage-quantities')
  getCategoryStageQuantities() { return this.dashboardService.getCategoryStageQuantities(); }

  @Get('avg-production-time')
  getAvgProductionTime() { return this.dashboardService.getAvgProductionTime(); }

  @Get('production-kpis')
  getProductionKpis() { return this.dashboardService.getProductionKpis(); }

  @Get('lead-source-analytics')
  getLeadSourceAnalytics() { return this.dashboardService.getLeadSourceAnalytics(); }
}
