import { Body, Controller, Get, Post } from '@nestjs/common';
import { StorefrontService } from './storefront.service';

@Controller('storefront')
export class StorefrontController {
  constructor(private readonly service: StorefrontService) {}

  @Get('catalog')
  catalog() {
    return this.service.catalog();
  }

  @Post('orders')
  createOrder(@Body() body: any) {
    return this.service.createOrder(body);
  }
}
