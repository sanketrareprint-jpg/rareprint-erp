import { Module } from '@nestjs/common';
import { BigshipService } from './bigship.service';

@Module({
  providers: [BigshipService],
  exports:   [BigshipService],
})
export class BigshipModule {}
