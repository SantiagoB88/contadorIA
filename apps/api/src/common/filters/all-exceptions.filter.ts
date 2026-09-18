import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import type { ApiError, ApiErrorCode } from '@dashgobo/contracts';
import { DomainError } from '../errors/domain-error';

interface NormalizedError {
  status: HttpStatus;
  code: ApiErrorCode;
  message: string;
  details: Record<string, unknown>;
}

/**
 * Single place where every thrown value becomes the canonical error envelope:
 * `{ error: { code, message, details, requestId } }`. Unexpected faults are
 * logged in full but returned as an opaque 500 — no internal detail leaks.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const requestId = request.id;

    const normalized = this.normalize(exception);

    if (normalized.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ err: exception, requestId }, 'Unhandled error');
    } else {
      this.logger.debug({ code: normalized.code, requestId }, normalized.message);
    }

    const body: ApiError = {
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
        ...(requestId ? { requestId } : {}),
      },
    };

    response.status(normalized.status).json(body);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof DomainError) {
      return {
        status: exception.httpStatus,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception);
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: {},
    };
  }

  private fromPrisma(exception: Prisma.PrismaClientKnownRequestError): NormalizedError {
    switch (exception.code) {
      case 'P2002': {
        const target = exception.meta?.['target'];
        return {
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'A record with these values already exists',
          details: target ? { fields: target } : {},
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'The requested record does not exist',
          details: {},
        };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'Operation violates a reference constraint',
          details: {},
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'INTERNAL_ERROR',
          message: 'An unexpected database error occurred',
          details: {},
        };
    }
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const status: HttpStatus = exception.getStatus();
    const payload = exception.getResponse();
    const rawMessage =
      typeof payload === 'string'
        ? payload
        : ((payload as { message?: string | string[] }).message ?? exception.message);

    // class-validator via ValidationPipe returns `message: string[]`.
    if (status === HttpStatus.BAD_REQUEST && Array.isArray(rawMessage)) {
      return {
        status,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: { issues: rawMessage },
      };
    }

    return {
      status,
      code: this.codeForStatus(status),
      message: Array.isArray(rawMessage) ? rawMessage.join(', ') : rawMessage,
      details: {},
    };
  }

  private codeForStatus(status: HttpStatus): ApiErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_ERROR';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHENTICATED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
