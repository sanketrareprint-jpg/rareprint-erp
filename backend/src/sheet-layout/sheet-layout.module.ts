import { Module } from '@nestjs/common';
import { SheetLayoutController } from './sheet-layout.controller';
import { SheetLayoutService } from './sheet-layout.service';

@Module({
  controllers: [SheetLayoutController],
  providers: [SheetLayoutService],
})
export class SheetLayoutModule {}
