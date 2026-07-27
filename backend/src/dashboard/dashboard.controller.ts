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
    return this.dashboardService.getSummary(req.user?.email);
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

  // Owner-only "things only the super-admin can do" queue — also bundled
  // into /dashboard/summary, exposed separately so it can be polled/refreshed
  // on its own without reloading the whole dashboard.
  @Get('super-admin-tasks')
  getSuperAdminTasks(@Req() req: Request & { user: JwtUser }) {
    if (req.user?.email !== 'sanket.rareprint@gmail.com') {
      return { generatedAt: new Date().toISOString(), totalPending: 0, groups: [] };
    }
    return this.dashboardService.getSuperAdminTasks();
  }
}
