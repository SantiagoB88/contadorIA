import { type ArgumentsHost, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { CustomerNotFoundError, InvalidInvoiceStateError } from '../errors/domain-error';

interface CapturedResponse {
  statusCode?: number;
  body?: unknown;
}

function runFilter(exception: unknown): CapturedResponse {
  const captured: CapturedResponse = {};
  const response = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ id: 'req-123' }),
    }),
  } as unknown as ArgumentsHost;

  const logger = {
    error: jest.fn(),
    debug: jest.fn(),
    setContext: jest.fn(),
  } as unknown as PinoLogger;
  new AllExceptionsFilter(logger).catch(exception, host);
  return captured;
}

describe('AllExceptionsFilter', () => {
  it('maps a DomainError to its code and status', () => {
    const { statusCode, body } = runFilter(new CustomerNotFoundError('cus-1'));

    expect(statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(body).toEqual({
      error: {
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found',
        details: { customerId: 'cus-1' },
        requestId: 'req-123',
      },
    });
  });

  it('maps an invalid state transition to 409', () => {
    const { statusCode, body } = runFilter(new InvalidInvoiceStateError('AUTHORIZED', 'DRAFT'));
    expect(statusCode).toBe(HttpStatus.CONFLICT);
    expect((body as { error: { code: string } }).error.code).toBe('INVALID_INVOICE_STATE');
  });

  it('turns class-validator output into a VALIDATION_ERROR with issues', () => {
    const { statusCode, body } = runFilter(new BadRequestException(['email must be an email']));

    expect(statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toMatchObject({
      error: { code: 'VALIDATION_ERROR', details: { issues: ['email must be an email'] } },
    });
  });

  it('maps a Prisma unique-constraint violation to 409 CONFLICT', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['email'] },
    });

    const { statusCode, body } = runFilter(prismaError);
    expect(statusCode).toBe(HttpStatus.CONFLICT);
    expect(body).toMatchObject({ error: { code: 'CONFLICT', details: { fields: ['email'] } } });
  });

  it('hides internal details of an unexpected error behind a 500', () => {
    const { statusCode, body } = runFilter(new Error('connection string leaked'));

    expect(statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: {},
        requestId: 'req-123',
      },
    });
  });

  it('passes through a generic HttpException status', () => {
    const { statusCode, body } = runFilter(new HttpException('nope', HttpStatus.FORBIDDEN));
    expect(statusCode).toBe(HttpStatus.FORBIDDEN);
    expect((body as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });
});
