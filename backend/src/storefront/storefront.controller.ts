import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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

  @Post('create-razorpay-order')
  createRazorpayOrder(@Body() body: { orderId: string; amount: number }) {
    return this.service.createRazorpayOrder(body.orderId, body.amount);
  }

  @Post('orders/:id/confirm-payment')
  confirmPayment(@Param('id') id: string, @Body() body: any) {
    return this.service.confirmPayment(id, body);
  }
}
