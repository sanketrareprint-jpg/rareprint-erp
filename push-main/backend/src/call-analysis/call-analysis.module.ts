import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CallAnalysisController } from './call-analysis.controller';
import { CallAnalysisService } from './call-analysis.service';

@Module({
  imports: [PrismaModule],
  controllers: [CallAnalysisController],
  providers: [CallAnalysisService],
})
export class CallAnalysisModule {}
