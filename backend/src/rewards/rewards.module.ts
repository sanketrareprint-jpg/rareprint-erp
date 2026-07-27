import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';
import { BonusPointsController } from './bonus-points.controller';
import { BonusPointsService } from './bonus-points.service';

@Module({
  imports: [PrismaModule],
  controllers: [RewardsController, BonusPointsController],
  providers: [RewardsService, BonusPointsService],
  exports: [RewardsService, BonusPointsService],
})
export class RewardsModule {}
