import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StorefrontService } from './storefront.service';

@Controller('storefront')
export class StorefrontController {
  constructor(private readonly service: StorefrontService) {}

  @Get('catalog')
  catalog() {
    return this.service.catalog();
  }

  @Get('home')
  home() {
    return this.service.home();
  }

  @Get('categories')
  categories() {
    return this.service.categories();
  }

  @Get('categories/:slug')
  category(@Param('slug') slug: string) {
    return this.service.category(slug);
  }

  @Get('products')
  products() {
    return this.service.products();
  }

  @Get('products/:slug')
  product(@Param('slug') slug: string) {
    return this.service.product(slug);
  }

  @Get('search')
  search(@Query('q') q = '') {
    return this.service.search(q);
  }

  @Get('reels')
  reels() {
    return this.service.reels();
  }

  @Get('banners')
  banners() {
    return this.service.banners();
  }

  @Get('content')
  content() {
    return this.service.content();
  }

  @Put('content')
  @UseGuards(AuthGuard('jwt'))
  updateContent(@Body() body: any) {
    return this.service.updateContent(body);
  }

  @Get('templates')
  templates() {
    return this.service.templates();
  }

  @Put('templates')
  @UseGuards(AuthGuard('jwt'))
  updateTemplates(@Body() body: any) {
    return this.service.updateTemplates(body);
  }

  @Post('orders')
  createOrder(@Body() body: any) {
    return this.service.createOrder(body);
  }

  @Post('uploads/artwork')
  uploadArtwork(@Body() body: any) {
    return this.service.uploadArtwork(body);
  }

  @Get('orders/track')
  trackOrder(@Query('orderNo') orderNo?: string, @Query('phone') phone?: string) {
    return this.service.trackOrder(orderNo, phone);
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
