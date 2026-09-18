import { type PipeTransform } from '@nestjs/common';
import { type ZodType } from 'zod';
import { ValidationError } from '../errors/validation-error';

/**
 * Validates (and coerces) a value against a Zod schema from `@dashgobo/contracts`.
 * On failure it throws a `ValidationError`, which `AllExceptionsFilter` renders
 * as `{ error: { code: 'VALIDATION_ERROR', details: { issues: [...] } } }`.
 *
 * Usage: `@Body(new ZodBody(loginRequestSchema)) body: LoginRequest`
 */
export class ZodBody<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationError(
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}

/**
 * Same pipe, aliased for use on `@Query()` — querystring values arrive as
 * strings, which the schema's `z.coerce`/defaults handle (see
 * `paginationQuerySchema`).
 */
export const ZodQuery = ZodBody;
