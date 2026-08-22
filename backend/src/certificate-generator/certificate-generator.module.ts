import { Module } from '@nestjs/common';
import { CertificateGeneratorController } from './certificate-generator.controller';
import { CertificateGeneratorService } from './certificate-generator.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CertificateGeneratorController],
  providers: [CertificateGeneratorService],
})
export class CertificateGeneratorModule {}
