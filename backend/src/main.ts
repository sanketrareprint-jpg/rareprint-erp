import * as cryptoNode from 'crypto';
if (!globalThis.crypto) {
  (globalThis as any).crypto = cryptoNode.webcrypto;
}

import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Order matters: NestJS applies filters last-registered first.
  // AllExceptionsFilter is the outermost catch-all; PrismaExceptionFilter
  // handles known Prisma codes with more specific messages.
  app.useGlobalFilters(new AllExceptionsFilter(), new PrismaExceptionFilter());
  app.use(require('express').json({ limit: '5mb' }));
  app.use(require('express').urlencoded({ limit: '5mb', extended: true }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? true,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
