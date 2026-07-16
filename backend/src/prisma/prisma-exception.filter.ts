import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url: string; method: string }>();

    // Previously this filter swallowed every Prisma error into a bare 500
    // with no logging at all, so failures like this were invisible in
    // Railway logs. Always log the real code/meta so the next one isn't a
    // silent mystery.
    this.logger.error(
      `[${request.method} ${request.url}] Prisma ${exception.code}: ${exception.message.split('\n').pop()?.trim()}`,
      JSON.stringify(exception.meta ?? {}),
    );

    if (exception.code === 'P1001') {
      return response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database is unavailable. Please try again shortly.',
        error: 'Service Unavailable',
      });
    }

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
      code: exception.code,
    });
  }
}
