import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, ServiceUnavailableException, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ShopifyService, isShopifyEnabled, type ApproveInput } from './shopify.service';
import { ShopifyInboxService } from './shopify-inbox.service';
import { verifyShopifyHmac } from './shopify.mapper';

// Public Shopify webhook receivers — no JWT; authenticity comes from the
// X-Shopify-Hmac-Sha256 signature over the raw body (captured in main.ts).
// Both answer 503 and do nothing on deployments without SHOPIFY_WEBHOOK_SECRET.
@Controller('shopify')
export class ShopifyController {
  constructor(private readonly service: ShopifyService) {}

  @Post('orders')
  @HttpCode(200)
  orders(@Req() req: any) {
    return this.handle('orders', req);
  }

  @Post('checkouts')
  @HttpCode(200)
  checkouts(@Req() req: any) {
    return this.handle('checkouts', req);
  }

  private handle(kind: 'orders' | 'checkouts', req: any) {
    if (!isShopifyEnabled()) throw new ServiceUnavailableException('Shopify integration is not configured');
    const hmac = req.headers['x-shopify-hmac-sha256'];
    if (!verifyShopifyHmac(req.rawBody, Array.isArray(hmac) ? hmac[0] : hmac, process.env.SHOPIFY_WEBHOOK_SECRET!.trim())) {
      throw new UnauthorizedException('Invalid Shopify signature');
    }
    return this.service.receive(kind, req.headers, req.body, req.rawBody);
  }
}

// Shopify module screens — signed-in users only; roles are checked per action
// in ShopifyInboxService / ShopifyService (Admin & Accounts review, sales
// agents view + WhatsApp + mark contacted, everyone else no access).
@Controller('shopify/inbox')
@UseGuards(AuthGuard('jwt'))
export class ShopifyInboxController {
  constructor(private readonly inbox: ShopifyInboxService, private readonly service: ShopifyService) {}

  @Get('counts')
  counts(@Req() req: any) {
    return this.inbox.counts(req.user);
  }

  @Get('orders')
  orders(@Req() req: any, @Query('status') status?: string, @Query('q') q?: string) {
    return this.inbox.listOrders(req.user, status, q);
  }

  @Get('orders/:id')
  order(@Req() req: any, @Param('id') id: string) {
    return this.inbox.getOrder(req.user, id);
  }

  @Post('orders/:id/approve')
  approve(@Req() req: any, @Param('id') id: string, @Body() body: ApproveInput) {
    if (!isShopifyEnabled()) throw new ServiceUnavailableException('Shopify integration is not configured');
    return this.service.approve(id, req.user, body);
  }

  @Post('orders/:id/reject')
  reject(@Req() req: any, @Param('id') id: string, @Body() body: { reason?: string }) {
    if (!isShopifyEnabled()) throw new ServiceUnavailableException('Shopify integration is not configured');
    return this.service.reject(id, req.user, body?.reason ?? '');
  }

  @Get('carts')
  carts(@Req() req: any, @Query('view') view?: string, @Query('q') q?: string) {
    return this.inbox.listCarts(req.user, view, q);
  }

  @Get('carts/lead-agents')
  leadAgents(@Req() req: any) {
    return this.inbox.leadAgents(req.user);
  }

  @Post('carts/:id/lead')
  createLead(@Req() req: any, @Param('id') id: string, @Body() body: { agentId?: string }) {
    return this.inbox.createLead(req.user, id, body?.agentId || null);
  }

  @Post('carts/:id/contacted')
  contacted(@Req() req: any, @Param('id') id: string) {
    return this.inbox.markContacted(req.user, id);
  }

  @Post('carts/:id/dismiss')
  dismiss(@Req() req: any, @Param('id') id: string) {
    return this.inbox.dismiss(req.user, id);
  }
}
