import { Module } from '@nestjs/common';
import { RateCalculatorController } from './rate-calculator.controller';
import { RateCalculatorService } from './rate-calculator.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RateCalculatorController],
  providers: [RateCalculatorService],
})
export class RateCalculatorModule {}
