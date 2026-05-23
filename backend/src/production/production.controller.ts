// backend/src/production/production.controller.ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { JobWorkStatus, OrderProductionStage, ProductionCategory, SheetProductionStage, SheetQuality, SheetStatus, ProductSides } from '@prisma/client';
import type { Request } from 'express';
import { SetMetadata } from '@nestjs/common';
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
@Injectable()
class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.get<string[]>('roles', ctx.getHandler());
    if (!roles) return true;
    const { user } = ctx.switchToHttp().getRequest();
    return roles.includes(user?.role);
  }
}
import { ClubbingSheetService } from './clubbing-sheet.service';
import { ProductionService } from './production.service';

type JwtUser = { id: string };

@Controller('production')
@UseGuards(AuthGuard('jwt'))
export class ProductionController {
  constructor(
    private readonly productionService: ProductionService,
    private readonly clubbingSheetService: ClubbingSheetService,
  ) {}

  // ── Inhouse ──────────────────────────────────────────────────────────────
  @Get('orders')
  listInProduction() { return this.productionService.listInProduction(); }

  @Patch('items/:itemId/stage')
  updateItemStage(
    @Param('itemId') itemId: string,
    @Body('stage') stage: OrderProductionStage,
    @Req() req: Request & { user: JwtUser },
  ) { return this.productionService.updateItemStage(itemId, stage, req.user.id); }

  @Patch('items/:itemId/assign-category')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'PRODUCTION', 'SALES_AGENT', 'ACCOUNTS', 'DISPATCH', 'AGENT')
  assignCategory(
    @Param('itemId') itemId: string,
    @Body('productionCategory') productionCategory: ProductionCategory,
    @Req() req: Request & { user: JwtUser },
  ) { return this.productionService.assignCategory(itemId, productionCategory, req.user.id); }

  // ── Clubbing ─────────────────────────────────────────────────────────────
  @Get('clubbing/orders')
  getClubbingOrders() { return this.clubbingSheetService.getClubbingOrders(); }

  @Get('clubbing/items/:itemId/jobworks')
  getJobWorks(@Param('itemId') itemId: string) { return this.clubbingSheetService.getJobWorks(itemId); }

  @Post('clubbing/jobworks')
  addJobWork(@Body() body: { orderItemId: string; vendorId: string; description: string; cost: number; vendorInvoiceNo?: string }) {
    return this.clubbingSheetService.addJobWork(body);
  }

  @Patch('clubbing/jobworks/:id')
  updateJobWork(
    @Param('id') id: string,
    @Body() body: { status?: JobWorkStatus; description?: string; cost?: number; vendorInvoiceNo?: string },
  ) { return this.clubbingSheetService.updateJobWork(id, body); }

  @Delete('clubbing/jobworks/:id')
  deleteJobWork(@Param('id') id: string) { return this.clubbingSheetService.deleteJobWork(id); }

  // ── Sheet Production ─────────────────────────────────────────────────────
  @Get('sheets')
  listSheets() { return this.clubbingSheetService.listSheets(); }

  @Post('sheets')
  createSheet(@Body() body: { gsm: number; quality: SheetQuality; quantity: number; actualPrintedQuantity?: number | null; sizeInches: string; printing: ProductSides }) {
    return this.clubbingSheetService.createSheet(body);
  }

  @Post('sheets/auto-organize')
  autoOrganizeSheets() {
    return this.clubbingSheetService.autoOrganizeSheets();
  }

  @Patch('sheets/:id')
  updateSheet(
    @Param('id') id: string,
    @Body() body: { sheetNo?: string; gsm?: number; quality?: SheetQuality; quantity?: number; actualPrintedQuantity?: number | null; sizeInches?: string; printing?: ProductSides },
  ) { return this.clubbingSheetService.updateSheet(id, body); }

  @Delete('sheets/:id')
  deleteSheet(@Param('id') id: string) {
    return this.clubbingSheetService.deleteSheet(id);
  }

  // ── Static routes MUST come before parameterized routes (:id) ──
  @Get('sheets/placeable-items')
  getPlaceableItems(@Query('gsm') gsm: string) { return this.clubbingSheetService.getPlaceableItems(Number(gsm)); }

  @Get('sheets/order-items')
  getSheetOrderItems() { return this.clubbingSheetService.getSheetOrderItems(); }

  @Delete('sheets/sheet-items/:id')
  removeItemFromSheet(@Param('id') id: string) { return this.clubbingSheetService.removeItemFromSheet(id); }

  @Delete('sheets/stage-vendors/:id')
  deleteSheetStageVendor(@Param('id') id: string) { return this.clubbingSheetService.deleteSheetStageVendor(id); }

  // ── Parameterized routes ──
  @Get('sheets/:id/items')
  getSheetItems(@Param('id') id: string) { return this.clubbingSheetService.getSheetItems(id); }

  @Patch('sheets/:id/status')
  updateSheetStatus(@Param('id') id: string, @Body('status') status: SheetStatus) {
    return this.clubbingSheetService.updateSheetStatus(id, status);
  }

  @Patch('sheets/:id/status-with-vendor')
  updateSheetStatusWithVendor(
    @Param('id') id: string,
    @Body() body: { status: SheetStatus; vendorId: string; activityType: string; cost?: number; vendorInvoiceNo?: string; description?: string },
  ) { return this.clubbingSheetService.updateSheetStatusWithVendor(id, body); }

  @Post('sheets/:id/items')
  placeItemOnSheet(
    @Param('id') sheetId: string,
    @Body() body: { orderItemId: string; productId: string; multiple: number; quantityOnSheet: number; areaSqInches: number },
  ) { return this.clubbingSheetService.placeItemOnSheet(sheetId, body); }

  @Post('sheets/:id/stage-vendors')
  addSheetStageVendor(
    @Param('id') sheetId: string,
    @Body() body: { stage: SheetProductionStage; vendorId: string; description?: string; cost: number; vendorInvoiceNo?: string },
  ) { return this.clubbingSheetService.addSheetStageVendor({ sheetId, ...body }); }
}
