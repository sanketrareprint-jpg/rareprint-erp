import { Module } from '@nestjs/common';
import { CostTableController } from './cost-table.controller';
import { CostTableService } from './cost-table.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CostTableController],
  providers: [CostTableService],
  exports: [CostTableService],
})
export class CostTableModule {}
