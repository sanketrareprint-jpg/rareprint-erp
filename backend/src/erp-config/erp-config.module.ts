import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ErpConfigController } from './erp-config.controller';
import { ErpConfigService } from './erp-config.service';

@Module({
  imports: [PrismaModule],
  controllers: [ErpConfigController],
  providers: [ErpConfigService],
  exports: [ErpConfigService],
})
export class ErpConfigModule {}
