// backend/src/billing/billing.module.ts
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  // MulterModule must be registered here for the logo/signature
  // FileInterceptor routes in BillingController to receive @UploadedFile()
  // at all — without it, req.file resolves to undefined regardless of what
  // the client sends (matches the same setup already used in
  // orders.module.ts / bank-statement.module.ts / remittance.module.ts for
  // their own file-upload endpoints). memoryStorage is explicit because
  // billing.service.ts reads file.buffer directly.
  imports: [PrismaModule, WhatsAppModule, MulterModule.register({ storage: memoryStorage() })],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
