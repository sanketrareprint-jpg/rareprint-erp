import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerDirectoryController } from './customer-directory.controller';
import { CustomerDirectoryService } from './customer-directory.service';

@Module({
  imports: [PrismaModule],
  controllers: [CustomerDirectoryController],
  providers: [CustomerDirectoryService],
})
export class CustomerDirectoryModule {}
