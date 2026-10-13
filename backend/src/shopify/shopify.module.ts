import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CrmModule } from '../crm/crm.module';
import { ShopifyController, ShopifyInboxController } from './shopify.controller';
import { ShopifyInboxService } from './shopify-inbox.service';
import { ShopifyService } from './shopify.service';

@Module({
  imports: [PrismaModule, CrmModule],
  controllers: [ShopifyController, ShopifyInboxController],
  providers: [ShopifyService, ShopifyInboxService],
})
export class ShopifyModule {}
