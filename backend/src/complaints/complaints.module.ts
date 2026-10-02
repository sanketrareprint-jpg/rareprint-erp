// backend/src/complaints/complaints.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ComplaintsController } from './complaints.controller';
import { ComplaintFormController } from './complaint-form.controller';
import { ComplaintsService } from './complaints.service';
import { ComplaintsSlaService } from './complaints.sla.service';
import { ComplaintsNotifications } from './complaints.notifications';

@Module({
  imports: [PrismaModule, WhatsAppModule],
  controllers: [ComplaintsController, ComplaintFormController],
  providers: [ComplaintsService, ComplaintsSlaService, ComplaintsNotifications],
})
export class ComplaintsModule {}
