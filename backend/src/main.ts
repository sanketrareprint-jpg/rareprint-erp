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
  // Diagnostic: if this never shows up in the deploy log, dist/src/main.js
  // itself was never reached (the hang is in railway-migrate.js, before the
  // app even starts) — not inside NestJS bootstrap.
  console.log('[main] bootstrap() starting, about to call NestFactory.create...');
  const app = await NestFactory.create(AppModule);
  console.log('[main] NestFactory.create resolved, configuring app...');
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
  // Allow the live website origin (FRONTEND_ORIGIN, e.g. the Vercel deploy)
  // plus the Capacitor Android app's origin. Capacitor's WebView makes
  // requests from "https://localhost" (because capacitor.config.ts sets
  // androidScheme: "https") — a different origin than the website, so
  // without explicitly allowing it here, the Android app's login/API calls
  // get silently blocked by CORS and show as "could not reach the server."
  const allowedOrigins = [
    process.env.FRONTEND_ORIGIN ?? 'https://rareprint-erp.vercel.app',
    'https://localhost', // Capacitor Android app
    'capacitor://localhost', // Capacitor iOS / legacy Android scheme, just in case
  ];
  app.enableCors({
    origin: (origin, callback) => {
      // No Origin header (e.g. curl, server-to-server) — allow.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`), false);
      }
    },
    credentials: true,
  });
  const port = process.env.PORT ?? 3000;
  console.log(`[main] Calling app.listen(${port})...`);
  await app.listen(port);
  console.log(`[main] Listening on port ${port}.`);
}
// Explicit catch so a rejected bootstrap() prints a real stack trace and
// exits non-zero, instead of potentially hanging silently as an unhandled
// promise rejection with no further output.
bootstrap().catch((err) => {
  console.error('[main] bootstrap() failed:', err);
  process.exit(1);
});
