import { Module } from '@nestjs/common';
import { ShiprocketModule } from '../shiprocket/shiprocket.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

@Module({
  imports: [ShiprocketModule],
  controllers: [DispatchController],
  providers: [DispatchService],
})
export class DispatchModule {}
