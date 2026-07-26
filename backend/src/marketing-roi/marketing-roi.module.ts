import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CallComplianceModule } from '../call-compliance/call-compliance.module';
import { MarketingRoiController } from './marketing-roi.controller';
import { MarketingRoiService } from './marketing-roi.service';

@Module({
  imports: [PrismaModule, CallComplianceModule],
  controllers: [MarketingRoiController],
  providers: [MarketingRoiService],
})
export class MarketingRoiModule {}
