// backend/src/production/production.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ClubbingSheetService } from './clubbing-sheet.service';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';
import { PaperInventoryModule } from '../paper-inventory/paper-inventory.module';
import { GmailDraftService } from './gmail-draft.service';

@Module({
  imports: [PrismaModule, WhatsAppModule, PaperInventoryModule],
  controllers: [ProductionController],
  providers: [ProductionService, ClubbingSheetService, GmailDraftService],
})
export class ProductionModule {}
