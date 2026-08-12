// backend/src/dashboard/dashboard.controller.ts
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
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
  getAgentLeaderboard(@Query('month') month?: string) { return this.dashboardService.getAgentLeaderboard(month); }

  @Get('category-stage-quantities')
  getCategoryStageQuantities() { return this.dashboardService.getCategoryStageQuantities(); }

  @Get('avg-production-time')
  getAvgProductionTime() { return this.dashboardService.getAvgProductionTime(); }

  @Get('production-kpis')
  getProductionKpis() { return this.dashboardService.getProductionKpis(); }

  @Get('lead-source-analytics')
  getLeadSourceAnalytics() { return this.dashboardService.getLeadSourceAnalytics(); }

  // Visible to everyone — see DashboardService.getComplaintsOverview.
  @Get('complaints-overview')
  getComplaintsOverview() { return this.dashboardService.getComplaintsOverview(); }

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

  // Owner-only — sales employee-wise profit (gross profit minus commission
  // and fixed salary), filterable by month. Its own endpoint (not bundled
  // into /dashboard/summary) so switching the month dropdown doesn't have to
  // reload the whole dashboard, same reasoning as agent-leaderboard above.
  @Get('agent-profit')
  getAgentProfit(@Query('month') month: string | undefined, @Req() req: Request & { user: JwtUser }) {
    if (req.user?.email !== 'sanket.rareprint@gmail.com') {
      return { year: null, month: null, agents: [], totals: null };
    }
    return this.dashboardService.getAgentProfitBreakdown(month);
  }
}
