import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { CostTableModule } from '../cost-table/cost-table.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { HrModule } from '../hr/hr.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [PrismaModule, WhatsAppModule, CostTableModule, LoyaltyModule, HrModule, NotificationsModule, BillingModule],
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}