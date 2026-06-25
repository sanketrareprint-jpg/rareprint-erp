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
import { GmailDraftService } from './gmail-draft.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

type JwtUser = { id: string };

@Controller('production')
@UseGuards(AuthGuard('jwt'))
export class ProductionController {
  constructor(
    private readonly productionService: ProductionService,
    private readonly clubbingSheetService: ClubbingSheetService,
    private readonly gmailDraftService: GmailDraftService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  // ── Gmail Draft + WhatsApp to vendor ─────────────────────────────────────
  @Post('send-vendor-draft')
  async createVendorDraft(
    @Body() body: {
      to: string; subject: string; body: string;
      vendorPhone?: string; vendorName?: string;
      orderNo?: string; poNumber?: string; productName?: string;
      size?: string; gsm?: string; sides?: string;
      quantity?: string; scheduleDate?: string;
      designFiles?: { filename: string; originalName: string }[];
    },
  ) {
    const results: Record<string, unknown> = {};

    // Gmail draft with design file attachments
    if (body.to) {
      try {
        results.gmail = await this.gmailDraftService.createDraft(
          body.to,
          body.subject,
          body.body,
          body.designFiles ?? [],
        );
      } catch (e) {
        results.gmailError = String(e);
      }
    }

    // WhatsApp via AiSensy
    if (body.vendorPhone) {
      results.whatsapp = await this.whatsAppService.sendVendorJobWork({
        vendorName: body.vendorName ?? 'Vendor',
        vendorPhone: body.vendorPhone,
        orderNo: body.orderNo ?? '',
        productName: body.productName ?? '',
        size: body.size ?? '—',
        gsm: body.gsm ?? '—',
        sides: body.sides ?? '—',
        poNumber: body.poNumber ?? body.orderNo ?? '—',
        quantity: body.quantity ?? '—',
        scheduleDate: body.scheduleDate ?? 'Not specified',
      });
    }

    return results;
  }

  // ── Inhouse ──────────────────────────────────────────────────────────────
  @Get('orders')
  listInProduction() { return this.productionService.listInProduction(); }

  @Patch('items/:itemId/stage')
  updateItemStage(
    @Param('itemId') itemId: string,
    @Body('stage') stage: OrderProductionStage,
    @Req() req: Request & { user: JwtUser },
  ) { return this.productionService.updateItemStage(itemId, stage, req.user.id); }

  @Patch('items/:itemId/follow-up-date')
  updateItemFollowUpDate(
    @Param('itemId') itemId: string,
    @Body('processingFollowUpDate') processingFollowUpDate?: string | null,
  ) { return this.productionService.updateItemFollowUpDate(itemId, processingFollowUpDate); }

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
  addJobWork(
    @Body() body: { orderItemId: string; vendorId: string; description: string; cost: number; vendorInvoiceNo?: string },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.clubbingSheetService.addJobWork(body, req.user.id);
  }

  @Patch('clubbing/jobworks/:id')
  updateJobWork(
    @Param('id') id: string,
    @Body() body: { status?: JobWorkStatus; description?: string; cost?: number; vendorInvoiceNo?: string; dueDate?: string | null },
    @Req() req: Request & { user: JwtUser },
  ) { return this.clubbingSheetService.updateJobWork(id, body, req.user.id); }

  @Delete('clubbing/jobworks/:id')
  deleteJobWork(@Param('id') id: string) { return this.clubbingSheetService.deleteJobWork(id); }

  // ── Sheet Production ─────────────────────────────────────────────────────
  @Get('sheets')
  listSheets() { return this.clubbingSheetService.listSheets(); }

  @Get('sheets/history')
  getSheetHistory(@Query('search') search?: string, @Query('toStatus') toStatus?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.clubbingSheetService.getSheetHistory({ search, toStatus, page: page ? Number(page) : 1, limit: limit ? Number(limit) : 50 });
  }

  @Post('sheets')
  createSheet(@Body() body: { gsm: number; quality: SheetQuality; quantity: number; actualPrintedQuantity?: number | null; sizeInches: string; printing: ProductSides }) {
    return this.clubbingSheetService.createSheet(body);
  }

  @Post('sheets/auto-organize')
  autoOrganizeSheets(@Req() req: Request & { user: JwtUser }) {
    return this.clubbingSheetService.autoOrganizeSheets(req.user.id);
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

  @Patch('sheets/sheet-items/:id/due-date')
  updateSheetItemDueDate(
    @Param('id') id: string,
    @Body('dueDate') dueDate?: string | null,
  ) { return this.clubbingSheetService.updateSheetItemDueDate(id, dueDate); }

  @Delete('sheets/sheet-items/:id')
  removeItemFromSheet(@Param('id') id: string) { return this.clubbingSheetService.removeItemFromSheet(id); }

  @Delete('sheets/stage-vendors/:id')
  deleteSheetStageVendor(@Param('id') id: string) { return this.clubbingSheetService.deleteSheetStageVendor(id); }

  // ── Parameterized routes ──
  @Get('sheets/:id/items')
  getSheetItems(@Param('id') id: string) { return this.clubbingSheetService.getSheetItems(id); }

  @Patch('sheets/:id/status')
  updateSheetStatus(@Param('id') id: string, @Body('status') status: SheetStatus, @Req() req: Request & { user: JwtUser }) {
    return this.clubbingSheetService.updateSheetStatus(id, status, req.user.id);
  }

  @Patch('sheets/:id/status-with-vendor')
  updateSheetStatusWithVendor(
    @Param('id') id: string,
    @Body() body: { status: SheetStatus; vendorId: string; activityType: string; cost?: number; vendorInvoiceNo?: string; description?: string },
    @Req() req: Request & { user: JwtUser },
  ) { return this.clubbingSheetService.updateSheetStatusWithVendor(id, body, req.user.id); }

  @Post('sheets/:id/items')
  placeItemOnSheet(
    @Param('id') sheetId: string,
    @Body() body: { orderItemId: string; productId: string; multiple: number; quantityOnSheet: number; areaSqInches: number },
    @Req() req: Request & { user: JwtUser },
  ) { return this.clubbingSheetService.placeItemOnSheet(sheetId, body, req.user.id); }

  @Post('sheets/:id/stage-vendors')
  addSheetStageVendor(
    @Param('id') sheetId: string,
    @Body() body: { stage: SheetProductionStage; vendorId: string; description?: string; cost: number; vendorInvoiceNo?: string },
    @Req() req: Request & { user: JwtUser },
  ) { return this.clubbingSheetService.addSheetStageVendor({ sheetId, ...body }, req.user.id); }
}
