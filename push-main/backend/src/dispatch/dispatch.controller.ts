import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
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

  @Get('rates/:orderId')
  getRates(@Param('orderId') orderId: string) {
    return this.dispatchService.getRates(orderId);
  }

  @Post('book')
  book(
    @Body() body: { orderId: string; itemIds: string[]; rateId: string; isCod?: boolean; codAmount?: number },
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.dispatchService.bookItems(
      body.orderId,
      body.itemIds,
      body.rateId,
      req.user.id,
      body.isCod,  // do NOT coerce undefined→false; service falls back to order notes detection
      body.codAmount,
    );
  }
}