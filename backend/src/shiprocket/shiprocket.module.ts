import { Module } from '@nestjs/common';
import { ShiprocketService } from './shiprocket.service';

@Module({
  providers: [ShiprocketService],
  exports: [ShiprocketService],
})
export class ShiprocketModule {}
