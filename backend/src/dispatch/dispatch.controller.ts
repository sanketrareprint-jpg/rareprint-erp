import { Body, Controller, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { DispatchService } from './dispatch.service';

type JwtUser = { id: string };
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
  getShipmentHistory(@Query('limit') limitStr?: string) {
    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 50, 200) : 50;
    return this.dispatchService.getShipmentHistory(limit);
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
  ) {
    const weightKgOverride = weightKgStr ? parseFloat(weightKgStr) : undefined;
    return this.dispatchService.getRates(orderId, warehouseId, weightKgOverride, {
      name: pickupName,
      pincode: pickupPincode,
      location: pickupLocation,
    }, parsePackageBoxes(packageBoxesRaw));
  }

  @Post('book')
  @UseInterceptors(FileInterceptor('invoiceFile'))
  book(
    @Body() body: {
      orderId: string;
      itemIds: string | string[];
      rateId: string;
      isCod?: string | boolean;
      codAmount?: string | number;
      warehouseId?: string;
      weightKgOverride?: string | number;
      selectedQuote?: string | Record<string, unknown>;
      pickupName?: string;
      pickupPincode?: string;
      pickupLocation?: string;
      packageBoxes?: string | DispatchPackageBox[];
    },
    @Req() req: Request & { user: JwtUser },
    @UploadedFile() invoiceFile?: Express.Multer.File,
  ) {
    // FormData sends everything as strings — parse JSON fields
    const itemIds: string[] = typeof body.itemIds === 'string' ? JSON.parse(body.itemIds) : body.itemIds;
    const selectedQuote = typeof body.selectedQuote === 'string' ? JSON.parse(body.selectedQuote) : body.selectedQuote;
    const packageBoxes = typeof body.packageBoxes === 'string' ? JSON.parse(body.packageBoxes) : body.packageBoxes;
    const isCod = body.isCod === 'true' || body.isCod === true;
    const codAmount = body.codAmount ? parseFloat(String(body.codAmount)) : undefined;
    const weightKgOverride = body.weightKgOverride ? parseFloat(String(body.weightKgOverride)) : undefined;
    return this.dispatchService.bookItems(
      body.orderId,
      itemIds,
      body.rateId,
      req.user.id,
      isCod,
      codAmount,
      body.warehouseId,
      weightKgOverride,
      {
        name: body.pickupName,
        pincode: body.pickupPincode,
        location: body.pickupLocation,
      },
      selectedQuote as { rateId: string; carrierName?: string; amount?: number; currency?: string; estimatedDays?: number } | undefined,
      packageBoxes as DispatchPackageBox[] | undefined,
      invoiceFile?.buffer,
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
    @Body() body: { orderId: string; awbNumber?: string; carrierName?: string; trackingNumber?: string; notes?: string },
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
}