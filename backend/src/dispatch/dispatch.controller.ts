import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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
