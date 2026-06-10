import { Module } from '@nestjs/common';
import { DesignStudioController } from './design-studio.controller';
import { DesignStudioService } from './design-studio.service';

@Module({
  controllers: [DesignStudioController],
  providers: [DesignStudioService],
})
export class DesignStudioModule {}
