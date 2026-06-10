import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { RewardsModule } from '../rewards/rewards.module';

@Module({
  imports: [PrismaModule, WhatsAppModule, RewardsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
