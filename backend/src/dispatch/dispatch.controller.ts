import { Body, Controller, Get, Param, Post, Query, Req, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { DispatchService } from './dispatch.service';

type JwtUser = { id: string; email?: string };

const SUPER_ADMIN_EMAIL = 'sanket.rareprint@gmail.com';
type DispatchPackageBox = {
  noOfBoxes?: number;
  length?: number;
  breadth?: number;
  height?: number;
  weight?: number;
};

function parsePackageBoxes(raw?: string): DispatchPackageBox[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as DispatchPackageBox[] : undefined;
  } catch {
    return undefined;
  }
}

@Controller('dispatch')
@UseGuards(AuthGuard('jwt'))
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Get('orders')
  listReadyForDispatch() {
    return this.dispatchService.listReadyForDispatch();
  }

  @Get('history')
  getShipmentHistory(@Query('limit') limitStr?: string, @Query('search') search?: string) {
    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 50, 200) : 50;
    return this.dispatchService.getShipmentHistory(limit, search);
  }

  @Get('warehouses')
  getWarehouses() {
    return this.dispatchService.getWarehouses();
  }

  @Get('warehouses/debug-raw')
  getWarehousesDebugRaw() {
    return this.dispatchService.getWarehousesDebugRaw();
  }

  @Get('rates/:orderId')
  getRates(
    @Param('orderId') orderId: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('weightKg') weightKgStr?: string,
    @Query('pickupName') pickupName?: string,
    @Query('pickupPincode') pickupPincode?: string,
    @Query('pickupLocation') pickupLocation?: string,
    @Query('packageBoxes') packageBoxesRaw?: string,
    // Which specific item(s) this rate quote is for -- when provided, the
    // quoted/declared value only reflects these items, not every ready item
    // on the order. Optional so older callers keep working unchanged.
    @Query('itemIds') itemIdsRaw?: string,
  ) {
    const weightKgOverride = weightKgStr ? parseFloat(weightKgStr) : undefined;
    const itemIds = itemIdsRaw ? itemIdsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    return this.dispatchService.getRates(orderId, warehouseId, weightKgOverride, {
      name: pickupName,
      pincode: pickupPincode,
      location: pickupLocation,
    }, parsePackageBoxes(packageBoxesRaw), itemIds);
  }

  @Post('book')
  book(
    @Body() body: {
      orderId: string;
      itemIds: string[];
      rateId: string;
      isCod?: boolean;
      codAmount?: number;
      warehouseId?: string;
      weightKgOverride?: number;
      selectedQuote?: {
        rateId: string;
        carrierName?: string;
        amount?: number;
        currency?: string;
        estimatedDays?: number;
      };
      pickupName?: string;
      pickupPincode?: string;
      pickupLocation?: string;
      packageBoxes?: DispatchPackageBox[];
      // Dispatcher-typed city name, sent only on a retry after Bigship
      // rejected the automatically-guessed city — see bigship.service.ts's
      // tryCreateAdhocOrder for why the ERP can't reliably guess this on
      // its own (Bigship has no pincode→city lookup API at all).
      manualShippingCity?: string;
    },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.dispatchService.bookItems(
      body.orderId,
      body.itemIds,
      body.rateId,
      req.user.id,
      body.isCod,
      body.codAmount,
      body.warehouseId,
      body.weightKgOverride,
      {
        name: body.pickupName,
        pincode: body.pickupPincode,
        location: body.pickupLocation,
      },
      body.selectedQuote,
      body.packageBoxes,
      body.manualShippingCity,
    );
  }

  @Post('book-transport')
  bookTransport(
    @Body() body: {
      orderId: string;
      itemIds: string[];
      transportName?: string;
      lrNumber?: string;
      transportChargesType?: string;
      transportBy?: string;
      totalTransportCharges?: number;
      notes?: string;
    },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.dispatchService.bookTransport(body, req.user.id);
  }

  @Post('direct/send-otp')
  sendDirectOtp(
    @Body() body: {
      orderId: string;
      itemIds: string[];
      dispatchType: 'BY_HAND' | 'SELF_COLLECTED';
      deliveryBoyName?: string;
      collectedByName?: string;
      collectedByPhone?: string;
    },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.dispatchService.sendDirectOtp(body, req.user.id);
  }

  @Post('direct/verify-otp')
  verifyDirectOtp(
    @Body() body: { orderId: string; otp: string },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.dispatchService.verifyDirectOtp(body.orderId, body.otp, req.user.id);
  }

  @Post('mark-dispatched')
  markDispatched(
    @Body() body: { orderId: string; awbNumber?: string; carrierName?: string; trackingNumber?: string; notes?: string; codAmount?: number },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.dispatchService.markManuallyDispatched(body.orderId, req.user.id, body);
  }


  @Post('return-to-queue/:orderId')
  returnToQueue(
    @Param('orderId') orderId: string,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.dispatchService.returnToQueue(orderId, req.user.id);
  }

  @Post('shipments/:shipmentId/mark-delivered')
  markDelivered(
    @Param('shipmentId') shipmentId: string,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.dispatchService.markDelivered(shipmentId, req.user.id);
  }

  @Post('shipments/:shipmentId/sync-bigship')
  syncBigship(@Param('shipmentId') shipmentId: string) {
    return this.dispatchService.syncShipmentFromBigship(shipmentId);
  }

  // ── Bigship "Delivered Orders Report" bulk import (Dispatch > History) ────

  /** POST /dispatch/delivered-report/preview  (multipart field: "file")
   *  Parses + matches only — no DB writes. Frontend shows the result grouped
   *  by match confidence and lets the admin confirm/adjust before anything
   *  is actually marked delivered. */
  @Post('delivered-report/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  previewDeliveredReport(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new Error('Delivered Orders Report file is required (field: file)');
    return this.dispatchService.previewDeliveredReportMatch(file.buffer);
  }

  /** POST /dispatch/delivered-report/confirm  { shipmentIds: string[] }
   *  Marks each shipment delivered (same effect as the per-row "Mark
   *  Delivered" button) and fires the feedback WhatsApp to each customer. */
  @Post('delivered-report/confirm')
  confirmDeliveredReport(
    @Body('shipmentIds') shipmentIds: string[],
    @Req() req: Request & { user: JwtUser },
  ) {
    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
      throw new Error('shipmentIds must be a non-empty array');
    }
    return this.dispatchService.confirmDeliveredFromReport(shipmentIds, req.user.id);
  }

  // ── Courier Charges (Dispatch > Courier Charges) ──────────────────────────

  /** GET /dispatch/courier-charges?month=YYYY-MM
   *  Every dispatched shipment with Actual (auto-fetched from the uploaded
   *  Shipping Charges report by AWB), Taken from customer (agent-entered),
   *  and Net = Taken − Actual. */
  @Get('courier-charges')
  listCourierCharges(@Query('month') month?: string) {
    return this.dispatchService.listCourierCharges({ month });
  }

  /** POST /dispatch/courier-charges/import  (multipart field: "file")
   *  Bigship's monthly "Shipping Charges" report — upserted by AWB. */
  @Post('courier-charges/import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  importShippingChargesReport(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user: JwtUser },
  ) {
    if (!file) throw new Error('Shipping Charges report file is required (field: file)');
    return this.dispatchService.importShippingChargesReport(file.buffer, file.originalname, req.user.id);
  }

  /** PATCH /dispatch/courier-charges/:shipmentId  { amount: number }
   *  Agent-entered "taken from customer" figure for that shipment. */
  @Post('courier-charges/:shipmentId/collected')
  updateCourierChargeCollected(
    @Param('shipmentId') shipmentId: string,
    @Body('amount') amount: number,
  ) {
    return this.dispatchService.updateCourierChargeCollected(shipmentId, Number(amount));
  }

  /** GET /dispatch/courier-charges/summary
   *  Monthly Actual/Taken/Net rollup for the Dashboard's Courier Profit
   *  section — owner-only, same gating as Marketing ROI. */
  @Get('courier-charges/summary')
  getCourierChargesSummary(@Req() req: Request & { user: JwtUser }) {
    if (req.user?.email !== SUPER_ADMIN_EMAIL) return [];
    return this.dispatchService.getMonthlyCourierProfitSummary();
  }

  @Post('shipments/sync-bigship-all')
  syncAllBigship() {
    return this.dispatchService.syncAllFromBigship();
  }

  @Post('shipments/:shipmentId/awb')
  setManualAwb(@Param('shipmentId') shipmentId: string, @Body('awbNumber') awbNumber: string) {
    return this.dispatchService.setManualAwb(shipmentId, awbNumber ?? '');
  }
}