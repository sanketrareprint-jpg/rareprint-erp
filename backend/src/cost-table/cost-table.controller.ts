import {
  Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query, Req, ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CostTableService } from './cost-table.service';

@Controller('cost-table')
@UseGuards(JwtAuthGuard)
export class CostTableController {
  constructor(private readonly svc: CostTableService) {}

  // Non-admins may only ever view/act on their own commission data.
  private assertSelfOrAdmin(req: any, userId: string) {
    if (req.user?.role !== 'ADMIN' && req.user?.id !== userId) {
      throw new ForbiddenException('You can only view your own commission data');
    }
  }

  private assertAdmin(req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Admin only');
    }
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  @Get('settings')
  getSettings() {
    return this.svc.getSettings();
  }

  @Put('settings')
  saveSettings(@Body() dto: any) {
    return this.svc.saveSettings(dto);
  }

  // ── Products with all slabs ───────────────────────────────────────────────

  @Get('products')
  getAllProductsWithSlabs() {
    return this.svc.getAllProductsWithSlabs();
  }

  @Get('products/:productId/slabs')
  getSlabsForProduct(@Param('productId') productId: string) {
    return this.svc.getSlabsForProduct(productId);
  }

  // ── CRUD slabs ────────────────────────────────────────────────────────────

  @Post('slabs')
  createSlab(@Body() dto: any) {
    return this.svc.createSlab(dto);
  }

  @Put('slabs/:id')
  updateSlab(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updateSlab(id, dto);
  }

  @Delete('slabs/:id')
  deleteSlab(@Param('id') id: string) {
    return this.svc.deleteSlab(id);
  }

  // ── Bulk upsert (replace all slabs for a product) ────────────────────────

  @Post('products/:productId/slabs/bulk')
  bulkUpsert(@Param('productId') productId: string, @Body() dto: { slabs: any[] }) {
    return this.svc.bulkUpsertSlabs(productId, dto.slabs);
  }

  // ── Rate list slabs (total selling rate by quantity) ─────────────────────

  @Get('products/:productId/rate-slabs')
  getRateSlabsForProduct(@Param('productId') productId: string) {
    return this.svc.getRateSlabsForProduct(productId);
  }

  @Post('products/:productId/rate-slabs/bulk')
  bulkUpsertRateSlabs(@Param('productId') productId: string, @Body() dto: { slabs: any[]; replaceAll?: boolean }) {
    return this.svc.bulkUpsertRateSlabs(productId, dto.slabs, dto.replaceAll ?? false);
  }

  // ── Profit and commission dashboard ──────────────────────────────────────

  @Get('profitability')
  getProfitabilitySummary() {
    return this.svc.getProfitabilitySummary();
  }

  @Get('products-without-cost')
  getProductsWithoutCost() {
    return this.svc.getProductsWithoutCost();
  }

  @Get('orders-without-cost')
  getOrdersWithoutCost() {
    return this.svc.getOrdersWithoutCost();
  }

  @Get('orders-without-rate')
  getOrdersWithoutRate() {
    return this.svc.getOrdersWithoutRate();
  }

  @Get('increased-cost')
  getIncreasedCostOrders() {
    return this.svc.getIncreasedCostOrders();
  }

  @Get('sales-agents')
  getSalesAgents() {
    return this.svc.getSalesAgents();
  }

  @Put('sales-agents/:userId/category')
  updateSalesAgentCategory(@Param('userId') userId: string, @Body() dto: { category: 'A' | 'B' | 'C' | 'D' | null }) {
    return this.svc.updateSalesAgentCategory(userId, dto.category ?? null);
  }

  @Put('sales-agents/:userId/salary')
  updateSalesAgentSalary(
    @Param('userId') userId: string,
    @Body() dto: { baseSalary: number | null },
    @Req() req: any,
  ) {
    this.assertAdmin(req);
    return this.svc.updateSalesAgentSalary(userId, dto.baseSalary ?? null);
  }

  @Get('sales-agents/:userId/salary')
  getUserSalaryInfo(@Param('userId') userId: string, @Req() req: any) {
    this.assertSelfOrAdmin(req, userId);
    return this.svc.getUserSalaryInfo(userId);
  }

  @Get('sales-agents/:userId/month-commission')
  getAgentMonthCommission(@Param('userId') userId: string, @Req() req: any) {
    this.assertSelfOrAdmin(req, userId);
    return this.svc.getAgentMonthCommission(userId);
  }

  // ── Commission sheets (agent × month) ────────────────────────────────────

  @Get('commission-summary')
  getCommissionSummary(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    return this.svc.getAllAgentsCommissionSummary(
      year  ? Number(year) : now.getFullYear(),
      month ? Number(month) : now.getMonth() + 1,
    );
  }

  @Get('sales-agents/:userId/commission')
  getAgentCommissionSheet(
    @Param('userId') userId: string,
    @Query('year') year: string | undefined,
    @Query('month') month: string | undefined,
    @Req() req: any,
  ) {
    this.assertSelfOrAdmin(req, userId);
    const now = new Date();
    return this.svc.getAgentCommissionSheet(
      userId,
      year ? Number(year) : now.getFullYear(),
      month ? Number(month) : now.getMonth() + 1,
    );
  }

  @Get('sales-agents/:userId/verified-sheets')
  getVerifiedCommissionSheets(@Param('userId') userId: string, @Req() req: any) {
    this.assertSelfOrAdmin(req, userId);
    return this.svc.getVerifiedCommissionSheets(userId);
  }

  @Post('sales-agents/:userId/commission/verify')
  verifyCommission(
    @Param('userId') userId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Req() req: any,
  ) {
    this.assertAdmin(req);
    return this.svc.verifyCommission(
      userId,
      Number(year),
      Number(month),
      req.user.id,
      req.user.fullName,
      req.user.role,
    );
  }

  @Delete('sales-agents/:userId/commission/verify')
  unverifyCommission(
    @Param('userId') userId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Req() req: any,
  ) {
    this.assertAdmin(req);
    return this.svc.unverifyCommission(userId, Number(year), Number(month));
  }

  @Post('sales-agents/:userId/commission/mark-paid')
  markCommissionPaid(
    @Param('userId') userId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Body() dto: { transactionId: string },
    @Req() req: any,
  ) {
    this.assertAdmin(req);
    return this.svc.markCommissionPaid(userId, Number(year), Number(month), dto.transactionId, req.user.id);
  }

  @Delete('sales-agents/:userId/commission/mark-paid')
  unmarkCommissionPaid(
    @Param('userId') userId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Req() req: any,
  ) {
    this.assertAdmin(req);
    return this.svc.unmarkCommissionPaid(userId, Number(year), Number(month));
  }

  @Post('sales-agents/:userId/commission/override')
  setCommissionOverride(
    @Param('userId') userId: string,
    @Body() dto: { orderItemId: string; amount: number },
    @Req() req: any,
  ) {
    this.assertAdmin(req);
    return this.svc.setCommissionOverride(userId, dto.orderItemId, Number(dto.amount), req.user.id);
  }

  @Delete('sales-agents/:userId/commission/override/:orderItemId')
  clearCommissionOverride(
    @Param('orderItemId') orderItemId: string,
    @Req() req: any,
  ) {
    this.assertAdmin(req);
    return this.svc.clearCommissionOverride(orderItemId);
  }

  // ── Margin & approval check ───────────────────────────────────────────────

  @Post('check-margin')
  checkMargin(@Body() dto: {
    productId: string;
    quantity: number;
    salePricePerUnit: number;
    agentId?: string;
  }) {
    return this.svc.checkMargin(dto);
  }
}
