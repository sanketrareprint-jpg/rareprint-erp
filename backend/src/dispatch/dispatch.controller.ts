import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { DispatchService } from './dispatch.service';

type JwtUser = { id: string };

@Controller('dispatch')
@UseGuards(AuthGuard('jwt'))
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Get('orders')
  listReadyForDispatch() {
    return this.dispatchService.listReadyForDispatch();
  }

  @Get('warehouses')
  getWarehouses() {
    return this.dispatchService.getWarehouses();
  }

  @Get('rates/:orderId')
  getRates(
    @Param('orderId') orderId: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('weightKg') weightKgStr?: string,
  ) {
    const weightKgOverride = weightKgStr ? parseFloat(weightKgStr) : undefined;
    return this.dispatchService.getRates(orderId, warehouseId, weightKgOverride);
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
    );
  }
}
