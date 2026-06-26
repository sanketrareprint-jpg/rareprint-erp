import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessRulesController } from './business-rules.controller';
import { BusinessRulesService } from './business-rules.service';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessRulesController],
  providers: [BusinessRulesService],
})
export class BusinessRulesModule {}
