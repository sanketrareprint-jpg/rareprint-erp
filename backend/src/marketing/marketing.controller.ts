import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { MarketingService } from './marketing.service';

interface JwtUser {
  id: string;
  role: string;
}

@Controller('marketing')
@UseGuards(AuthGuard('jwt'))
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Get('overview')
  overview(@Req() req: Request & { user: JwtUser }) {
    return this.marketing.getOverview(req.user.id, req.user.role);
  }

  @Get('contacts')
  contacts(@Query() query: any) {
    return this.marketing.getContacts(query);
  }

  @Post('contacts/import')
  importContacts(@Body() body: { rows: any[] }) {
    return this.marketing.importContacts(body.rows ?? []);
  }

  @Patch('contacts/:id')
  updateContact(@Param('id') id: string, @Body() body: any) {
    return this.marketing.updateContact(id, body);
  }

  @Post('contacts/:id/opt-out')
  optOut(@Param('id') id: string) {
    return this.marketing.optOutContact(id);
  }

  @Get('segments')
  segments() {
    return this.marketing.getSegments();
  }

  @Post('segments')
  createSegment(@Body() body: any) {
    return this.marketing.createSegment(body);
  }

  @Post('segments/preview')
  previewSegment(@Body() body: { filters: any }) {
    return this.marketing.previewSegment(body.filters ?? {});
  }

  @Get('templates')
  templates() {
    return this.marketing.getTemplates();
  }

  @Post('templates')
  createTemplate(@Body() body: any) {
    return this.marketing.createTemplate(body);
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.marketing.deleteTemplate(id);
  }

  @Get('campaigns')
  campaigns() {
    return this.marketing.getCampaigns();
  }

  @Post('campaigns')
  createCampaign(@Body() body: any, @Req() req: Request & { user: JwtUser }) {
    return this.marketing.createCampaign(body, req.user.id);
  }

  @Post('campaigns/:id/clone')
  cloneCampaign(@Param('id') id: string, @Req() req: Request & { user: JwtUser }) {
    return this.marketing.cloneCampaign(id, req.user.id);
  }

  @Delete('campaigns/:id')
  deleteCampaign(@Param('id') id: string) {
    return this.marketing.deleteCampaign(id);
  }

  @Patch('campaigns/:id/status')
  updateCampaignStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.marketing.updateCampaignStatus(id, status);
  }

  @Post('campaigns/:id/schedule')
  scheduleCampaign(@Param('id') id: string) {
    return this.marketing.scheduleCampaign(id);
  }

  @Post('broadcasts/process')
  processBroadcasts() {
    return this.marketing.processDueBroadcastJobs();
  }

  @Post('broadcasts/test-one')
  testOneBroadcast() {
    return this.marketing.processOneBroadcastJob();
  }

  @Get('broadcasts/diagnostics')
  broadcastDiagnostics() {
    return this.marketing.getBroadcastDiagnostics();
  }

  @Get('analytics')
  analytics() {
    return this.marketing.getAnalytics();
  }

  @Get('agent-dashboard')
  agentDashboard(@Req() req: Request & { user: JwtUser }) {
    return this.marketing.getAgentDashboard(req.user.id, req.user.role);
  }

  // ─── MANUAL TRIGGER: Sync CRM leads (last 7 days) → MarketingContact ──────
  @Post('sync-crm-leads')
  syncCrmLeads() {
    return this.marketing.syncCrmLeadsToMarketing();
  }

  // ─── BROADCAST SETTINGS ──────────────────────────────────────────────────
  @Get('settings')
  getSettings() {
    return this.marketing.getMarketingSettings();
  }

  @Patch('settings')
  updateSettings(@Body() body: any) {
    return this.marketing.updateMarketingSettings(body);
  }
}
