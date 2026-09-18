import { HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from '@dashgobo/contracts';

export type ErrorDetails = Record<string, unknown>;

/**
 * Base class for expected, business-level failures. These are translated to a
 * consistent HTTP response by `AllExceptionsFilter`. Anything that is NOT a
 * `DomainError` is treated as an unexpected fault (HTTP 500, no detail leaked).
 */
export abstract class DomainError extends Error {
  abstract readonly code: ApiErrorCode;
  abstract readonly httpStatus: HttpStatus;
  readonly details: ErrorDetails;

  constructor(message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

// ─────────────── Not found ───────────────

export class NotFoundError extends DomainError {
  readonly code: ApiErrorCode = 'NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
}

export class CustomerNotFoundError extends DomainError {
  readonly code: ApiErrorCode = 'CUSTOMER_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;

  constructor(customerId: string) {
    super('Customer not found', { customerId });
  }
}

export class ProductNotFoundError extends DomainError {
  readonly code: ApiErrorCode = 'PRODUCT_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;

  constructor(productId: string) {
    super('Product not found', { productId });
  }
}

export class InvoiceNotFoundError extends DomainError {
  readonly code: ApiErrorCode = 'INVOICE_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;

  constructor(invoiceId: string) {
    super('Invoice not found', { invoiceId });
  }
}

// ─────────────── Auth / tenancy ───────────────

export class UnauthenticatedError extends DomainError {
  readonly code: ApiErrorCode = 'UNAUTHENTICATED';
  readonly httpStatus = HttpStatus.UNAUTHORIZED;

  constructor(message = 'Authentication required') {
    super(message);
  }
}

export class InvalidCredentialsError extends DomainError {
  readonly code: ApiErrorCode = 'INVALID_CREDENTIALS';
  readonly httpStatus = HttpStatus.UNAUTHORIZED;

  constructor() {
    super('Invalid email or password');
  }
}

export class ForbiddenError extends DomainError {
  readonly code: ApiErrorCode = 'FORBIDDEN';
  readonly httpStatus = HttpStatus.FORBIDDEN;

  constructor(message = 'You do not have permission to perform this action') {
    super(message);
  }
}

export class UnauthorizedOrganizationAccessError extends DomainError {
  readonly code: ApiErrorCode = 'ORGANIZATION_ACCESS_DENIED';
  readonly httpStatus = HttpStatus.FORBIDDEN;

  constructor(organizationId: string) {
    super('You are not a member of this organization', { organizationId });
  }
}

// ─────────────── Conflicts / state ───────────────

export class EmailAlreadyRegisteredError extends DomainError {
  readonly code: ApiErrorCode = 'EMAIL_ALREADY_REGISTERED';
  readonly httpStatus = HttpStatus.CONFLICT;

  constructor() {
    super('That email address is already registered');
  }
}

export class ConflictError extends DomainError {
  readonly code: ApiErrorCode = 'CONFLICT';
  readonly httpStatus = HttpStatus.CONFLICT;
}

export class InvoiceAlreadyAuthorizedError extends DomainError {
  readonly code: ApiErrorCode = 'INVOICE_ALREADY_AUTHORIZED';
  readonly httpStatus = HttpStatus.CONFLICT;

  constructor(invoiceId: string) {
    super('Invoice has already been authorized', { invoiceId });
  }
}

export class InvalidInvoiceStateError extends DomainError {
  readonly code: ApiErrorCode = 'INVALID_INVOICE_STATE';
  readonly httpStatus = HttpStatus.CONFLICT;

  constructor(from: string, to: string) {
    super(`Invalid invoice state transition: ${from} -> ${to}`, { from, to });
  }
}

export class IdempotencyKeyConflictError extends DomainError {
  readonly code: ApiErrorCode = 'IDEMPOTENCY_KEY_CONFLICT';
  readonly httpStatus = HttpStatus.CONFLICT;

  constructor() {
    super('This Idempotency-Key was already used with a different request');
  }
}

// ─────────────── External providers ───────────────

export class InvoiceProviderError extends DomainError {
  readonly code: ApiErrorCode = 'INVOICE_PROVIDER_ERROR';
  readonly httpStatus = HttpStatus.BAD_GATEWAY;

  constructor(message: string, details: ErrorDetails = {}) {
    super(message, details);
  }
}
