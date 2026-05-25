// File: backend/src/crm/crm.module.ts
import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmWebhookController } from './crm-webhook.controller';
import { CrmService } from './crm.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CrmController, CrmWebhookController],
  providers: [CrmService],
})
export class CrmModule {}

