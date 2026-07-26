// backend/src/call-compliance/call-compliance.module.ts
import { Module } from '@nestjs/common';
import { CallComplianceController } from './call-compliance.controller';
import { CallComplianceService } from './call-compliance.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CallComplianceController],
  providers: [CallComplianceService],
})
export class CallComplianceModule {}
