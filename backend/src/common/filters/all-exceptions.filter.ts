/**
 * AllExceptionsFilter — global catch-all for the RarePrint ERP backend.
 *
 * Registered AFTER PrismaExceptionFilter in main.ts so Prisma-specific
 * errors are already handled; this catches everything else:
 *   - Prisma.PrismaClientValidationError  (column/field missing from DB)
 *   - Prisma.PrismaClientUnknownRequestError
 *   - NestJS HttpException (already have a statusCode)
 *   - Plain JS Error / TypeError / ReferenceError
 *   - Any other thrown value
 *
 * Effect: no endpoint ever returns an HTML 500 page or crashes the process.
 * Every failure returns a clean JSON body the frontend can read.
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url: string; method: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let detail: string | undefined;

    // ── NestJS HttpException (BadRequestException, NotFoundException, etc.) ──
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        message = (b.message as string) ?? message;
      }
    }

    // ── Prisma validation error: column / field missing from the live DB ──
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Database schema mismatch — a required column may be missing. Check migration status.';
      detail = exception.message.slice(0, 400); // truncate for safety
      this.logger.error(
        `[${request.method} ${request.url}] PrismaClientValidationError`,
        detail,
      );
    }

    // ── Prisma unknown request error ──
    else if (exception instanceof Prisma.PrismaClientUnknownRequestError) {
      message = 'Unknown database error';
      detail = exception.message.slice(0, 400);
      this.logger.error(
        `[${request.method} ${request.url}] PrismaClientUnknownRequestError`,
        detail,
      );
    }

    // ── Generic JS errors ──
    else if (exception instanceof Error) {
      message = exception.message || message;
      detail = exception.stack?.split('\n').slice(0, 4).join(' | ');
      this.logger.error(
        `[${request.method} ${request.url}] Unhandled Error: ${exception.message}`,
        exception.stack,
      );
    }

    // ── Non-Error thrown values (strings, numbers, objects) ──
    else {
      this.logger.error(
        `[${request.method} ${request.url}] Unknown exception type`,
        JSON.stringify(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(detail ? { detail } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
