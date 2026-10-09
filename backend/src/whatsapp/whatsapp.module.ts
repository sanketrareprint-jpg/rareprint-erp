// backend/src/whatsapp/whatsapp.module.ts
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppRequestContextInterceptor } from './whatsapp-request-context';

@Module({
  imports: [PrismaModule],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppService,
    // App-wide: remembers which user's request started each WhatsApp send.
    { provide: APP_INTERCEPTOR, useClass: WhatsAppRequestContextInterceptor },
  ],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
