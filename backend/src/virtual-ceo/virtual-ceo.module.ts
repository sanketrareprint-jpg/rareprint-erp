// backend/src/virtual-ceo/virtual-ceo.module.ts
import { Module } from '@nestjs/common';
import { VirtualCeoController } from './virtual-ceo.controller';
import { VirtualCeoService } from './virtual-ceo.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [PrismaModule, WhatsAppModule],
  controllers: [VirtualCeoController],
  providers: [VirtualCeoService],
})
export class VirtualCeoModule {}
