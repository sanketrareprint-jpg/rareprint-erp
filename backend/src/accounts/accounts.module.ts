import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { CostTableModule } from '../cost-table/cost-table.module';

@Module({
  imports: [PrismaModule, WhatsAppModule, CostTableModule],
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}