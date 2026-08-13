// backend/src/machine-readings/machine-readings.module.ts
import { Module } from '@nestjs/common';
import { MachineReadingsController } from './machine-readings.controller';
import { MachineReadingsService } from './machine-readings.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MachineReadingsController],
  providers: [MachineReadingsService],
  exports: [MachineReadingsService],
})
export class MachineReadingsModule {}
