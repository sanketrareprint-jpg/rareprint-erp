import { Body, Controller, Headers, Post } from '@nestjs/common';
import { MarketingService } from './marketing.service';

@Controller('webhooks/aisensy/marketing')
export class MarketingWebhookController {
  constructor(private readonly marketing: MarketingService) {}

  @Post('status')
  status(@Body() body: any, @Headers('x-aisensy-signature') signature?: string) {
    return this.marketing.receiveAisensyWebhook(body, signature, 'status');
  }

  @Post('reply')
  reply(@Body() body: any, @Headers('x-aisensy-signature') signature?: string) {
    return this.marketing.receiveAisensyWebhook(body, signature, 'reply');
  }
}
