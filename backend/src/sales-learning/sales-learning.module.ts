import { Module } from '@nestjs/common';
import { SalesLearningController } from './sales-learning.controller';
import { SalesLearningService } from './sales-learning.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SalesLearningController],
  providers: [SalesLearningService],
})
export class SalesLearningModule {}
