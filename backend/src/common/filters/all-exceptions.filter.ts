import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

export interface FieldError {
  field: string;
  messages: string[];
}

/** The one error shape every endpoint returns. */
export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
  details?: FieldError[];
  path: string;
  timestamp: string;
}

/** Thrown by the global ValidationPipe so field errors survive to the client. */
export class ValidationFailedException extends HttpException {
  constructor(readonly details: FieldError[]) {
    super('Validation failed', HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const { statusCode, message, details } = this.resolve(exception);

    if (statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} → ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponseBody = {
      statusCode,
      error: HttpStatus[statusCode] ?? 'ERROR',
      message,
      ...(details ? { details } : {}),
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    };
    res.status(statusCode).json(body);
  }

  private resolve(exception: unknown): {
    statusCode: number;
    message: string;
    details?: FieldError[];
  } {
    if (exception instanceof ValidationFailedException) {
      return {
        statusCode: exception.getStatus(),
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : Array.isArray((response as { message?: unknown }).message)
            ? (response as { message: string[] }).message.join('; ')
            : String((response as { message?: unknown }).message ?? exception.message);
      return { statusCode: exception.getStatus(), message };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception);
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
    };
  }

  private fromPrisma(e: Prisma.PrismaClientKnownRequestError) {
    switch (e.code) {
      case 'P2002': {
        const target = (e.meta?.target as string[] | string | undefined) ?? 'field';
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `A record with this ${Array.isArray(target) ? target.join(', ') : target} already exists`,
        };
      }
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'Related record constraint failed',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database error',
        };
    }
  }
}
