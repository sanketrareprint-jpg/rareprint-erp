import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CrmModule } from '../crm/crm.module';
import { ShopifyController } from './shopify.controller';
import { ShopifyService } from './shopify.service';

@Module({
  imports: [PrismaModule, CrmModule],
  controllers: [ShopifyController],
  providers: [ShopifyService],
})
export class ShopifyModule {}
