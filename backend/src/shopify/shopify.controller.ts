import { Controller, HttpCode, Post, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ShopifyService, isShopifyEnabled } from './shopify.service';
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
