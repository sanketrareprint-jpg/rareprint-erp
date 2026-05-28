import { Module } from '@nestjs/common';
import { CarrierConfigService } from './carrier-config.service';
import { CarrierConfigController } from './carrier-config.controller';
import { BigshipModule } from '../bigship/bigship.module';

@Module({
  imports:     [BigshipModule],
  controllers: [CarrierConfigController],
  providers:   [CarrierConfigService],
  exports:     [CarrierConfigService],
})
export class CarrierConfigModule {}
