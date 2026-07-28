// backend/src/dispatch/dispatch.module.ts
import { Module } from '@nestjs/common';
import { ShiprocketModule } from '../shiprocket/shiprocket.module';
import { BigshipModule } from '../bigship/bigship.module';
import { CarrierConfigModule } from '../carrier-config/carrier-config.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ShiprocketModule, BigshipModule, CarrierConfigModule, PrismaModule, WhatsAppModule, NotificationsModule],
  controllers: [DispatchController],
  providers: [DispatchService],
})
export class DispatchModule {}
