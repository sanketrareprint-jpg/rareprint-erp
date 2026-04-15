import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OrderProductionStage } from '@prisma/client';
import type { Request } from 'express';
import { ProductionService } from './production.service';

type JwtUser = { id: string };

@Controller('production')
@UseGuards(AuthGuard('jwt'))
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Get('orders')
  listInProduction() {
    return this.productionService.listInProduction();
  }

  @Patch('items/:itemId/stage')
  updateItemStage(
    @Param('itemId') itemId: string,
    @Body('stage') stage: OrderProductionStage,
    @Req() req: Request & { user: JwtUser },
  ) {
    return this.productionService.updateItemStage(itemId, stage, req.user.id);
  }
}