import { HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from '@dashgobo/contracts';
import { DomainError } from './domain-error';

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ValidationError extends DomainError {
  readonly code: ApiErrorCode = 'VALIDATION_ERROR';
  readonly httpStatus = HttpStatus.BAD_REQUEST;

  constructor(issues: ValidationIssue[]) {
    super('Request validation failed', { issues });
  }
}
