// backend/src/bank-statement/bank-statement.module.ts
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PrismaModule } from '../prisma/prisma.module';
import { BankStatementController } from './bank-statement.controller';
import { BankStatementService } from './bank-statement.service';

@Module({
  imports: [
    PrismaModule,
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [BankStatementController],
  providers: [BankStatementService],
  exports: [BankStatementService],
})
export class BankStatementModule {}
