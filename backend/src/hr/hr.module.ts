import { Module } from '@nestjs/common';
import { HrController } from './hr.controller';
import { HrAgreementController } from './hr-agreement.controller';
import { HrService } from './hr.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductionModule } from '../production/production.module';

@Module({
  imports: [PrismaModule, ProductionModule],
  controllers: [HrController, HrAgreementController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
