// backend/src/paper-inventory/paper-inventory.module.ts
import { Module } from '@nestjs/common';
import { PaperInventoryController } from './paper-inventory.controller';
import { PaperInventoryService } from './paper-inventory.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PaperInventoryController],
  providers: [PaperInventoryService],
  exports: [PaperInventoryService],
})
export class PaperInventoryModule {}
