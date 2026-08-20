import { Module } from '@nestjs/common';
import { CarrierConfigModule } from '../carrier-config/carrier-config.module';
import { FshipService } from './fship.service';

@Module({
  imports:   [CarrierConfigModule],
  providers: [FshipService],
  exports:   [FshipService],
})
export class FshipModule {}
