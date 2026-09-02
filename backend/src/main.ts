console.log('[main] main.js loaded, starting requires...');

import * as cryptoNode from 'crypto';
if (!globalThis.crypto) {
  (globalThis as any).crypto = cryptoNode.webcrypto;
}
console.log('[main] crypto polyfill done.');

import 'dotenv/config';
console.log('[main] dotenv/config required.');

import { ValidationPipe } from '@nestjs/common';
console.log('[main] @nestjs/common required.');

import { NestFactory } from '@nestjs/core';
console.log('[main] @nestjs/core required.');

console.log('[main] about to require ./app.module (pulls in every feature module)...');
import { AppModule } from './app.module';
console.log('[main] ./app.module required successfully.');

import { PrismaExceptionFilter } from './prisma/prisma-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
console.log('[main] all imports done, defining bootstrap()...');

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
  // Allow the live website origin(s) plus the Capacitor Android app's
  // origin. Capacitor's WebView makes requests from "https://localhost"
  // (because capacitor.config.ts sets androidScheme: "https") — a different
  // origin than the website, so without explicitly allowing it here, the
  // Android app's login/API calls get silently blocked by CORS and show as
  // "could not reach the server." (This is exactly what happened before —
  // see the CORS fix history.)
  //
  // FRONTEND_ORIGIN was previously a single exact-match string, which meant
  // ANY other valid way of reaching the same site — the raw *.vercel.app
  // URL when a custom domain is configured, a "www." vs bare-domain
  // mismatch, or a Vercel preview deployment URL — got hard CORS-blocked
  // with the exact same generic "could not reach the server" message,
  // indistinguishable from a real outage. That's a very plausible cause of
  // "works for some people, not others" reports: whoever is using a
  // slightly different (but equally valid) URL to the same app just fails
  // silently. Fixed to be defensive instead of a single strict string:
  //  - FRONTEND_ORIGIN may now be a comma-separated list of exact origins.
  //  - The permanent rareprint-erp.vercel.app fallback is ALWAYS allowed,
  //    even when a custom domain is also configured, so switching domains
  //    never breaks whoever still has the old URL bookmarked/shared.
  //  - Any Vercel preview deployment for this project
  //    (rareprint-erp-*.vercel.app) is allowed via pattern match, since
  //    those get a fresh random URL per branch/PR that can never be listed
  //    in a static allowlist ahead of time.
  const staticAllowedOrigins = new Set(
    [
      ...(process.env.FRONTEND_ORIGIN ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
      'https://rareprint-erp.vercel.app',
      'https://localhost', // Capacitor Android app
      'capacitor://localhost', // Capacitor iOS / legacy Android scheme, just in case
    ],
  );
  const vercelPreviewPattern = /^https:\/\/rareprint-erp(-[a-z0-9-]+)?\.vercel\.app$/;
  app.enableCors({
    origin: (origin, callback) => {
      // No Origin header (e.g. curl, server-to-server) — allow.
      if (!origin || staticAllowedOrigins.has(origin) || vercelPreviewPattern.test(origin)) {
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
