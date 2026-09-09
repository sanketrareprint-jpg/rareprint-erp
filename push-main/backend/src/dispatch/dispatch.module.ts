// backend/src/dispatch/dispatch.module.ts
import { Module } from '@nestjs/common';
import { ShiprocketModule } from '../shiprocket/shiprocket.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [ShiprocketModule, PrismaModule, WhatsAppModule],
  controllers: [DispatchController],
  providers: [DispatchService],
})
export class DispatchModule {}