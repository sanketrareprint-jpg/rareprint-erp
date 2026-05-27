import {
  Controller, Get, Post, Put, Delete, Body, Param, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CostTableService } from './cost-table.service';

@Controller('cost-table')
@UseGuards(JwtAuthGuard)
export class CostTableController {
  constructor(private readonly svc: CostTableService) {}

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
