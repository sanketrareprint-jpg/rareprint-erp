import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketingController } from './marketing.controller';
import { MarketingWebhookController } from './marketing-webhook.controller';
import { MarketingService } from './marketing.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [PrismaModule, WhatsAppModule],
  controllers: [MarketingController, MarketingWebhookController],
  providers: [MarketingService],
})
export class MarketingModule {}
