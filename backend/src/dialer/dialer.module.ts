// backend/src/dialer/dialer.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DialerController } from './dialer.controller';
import { DialerService } from './dialer.service';

@Module({
  imports: [PrismaModule],
  controllers: [DialerController],
  providers: [DialerService],
})
export class DialerModule {}
