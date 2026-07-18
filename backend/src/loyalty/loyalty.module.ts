// backend/src/loyalty/loyalty.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CostTableModule } from '../cost-table/cost-table.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyController } from './loyalty.controller';

@Module({
  imports: [PrismaModule, CostTableModule, WhatsAppModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
