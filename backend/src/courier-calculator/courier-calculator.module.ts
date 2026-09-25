import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BigshipModule } from '../bigship/bigship.module';
import { FshipModule } from '../fship/fship.module';
import { CarrierConfigModule } from '../carrier-config/carrier-config.module';
import { CourierCalculatorController } from './courier-calculator.controller';
import { CourierCalculatorService } from './courier-calculator.service';

@Module({
  imports: [PrismaModule, BigshipModule, FshipModule, CarrierConfigModule],
  controllers: [CourierCalculatorController],
  providers: [CourierCalculatorService],
})
export class CourierCalculatorModule {}
