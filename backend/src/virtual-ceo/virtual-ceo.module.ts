// backend/src/virtual-ceo/virtual-ceo.module.ts
import { Module } from '@nestjs/common';
import { VirtualCeoController } from './virtual-ceo.controller';
import { VirtualCeoPublicController } from './virtual-ceo-public.controller';
import { VirtualCeoService } from './virtual-ceo.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [PrismaModule, WhatsAppModule],
  controllers: [VirtualCeoController, VirtualCeoPublicController],
  providers: [VirtualCeoService],
})
export class VirtualCeoModule {}
