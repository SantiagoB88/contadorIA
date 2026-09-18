import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { from, of, type Observable } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { IDEMPOTENCY_KEY_HEADER } from '@dashgobo/contracts';
import { IdempotencyKeyConflictError } from '../errors';
import { IdempotencyKeyRepository } from './idempotency-key.repository';
import { stableHash } from './stable-hash';

/**
 * Opt-in via the `Idempotency-Key` header (§21). Absent header = normal
 * behavior. Present header:
 *  - same key + same body seen before -> replay the stored response, the
 *    handler never runs again (a retried POST /invoices or
 *    POST /invoices/:id/authorize cannot create/authorize twice);
 *  - same key + different body -> `IdempotencyKeyConflictError` (409) — the
 *    key is being reused for a different request, which is a client bug;
 *  - unseen key -> run normally, then persist the response under that key.
 *
 * Must run after `OrgScopeGuard` (needs `req.orgContext` to scope the key to
 * a tenant) — apply on routes that already carry that guard.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly repo: IdempotencyKeyRepository) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const rawKey = request.headers[IDEMPOTENCY_KEY_HEADER];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    const organizationId = request.orgContext?.organizationId;

    if (!key || !organizationId) return next.handle();

    const endpoint = `${context.getClass().name}.${context.getHandler().name}`;
    const requestHash = stableHash(request.body);

    return from(this.repo.findByKey(organizationId, endpoint, key)).pipe(
      switchMap((existing) => {
        if (existing) {
          if (existing.requestHash !== requestHash) throw new IdempotencyKeyConflictError();
          return of(existing.responseBody);
        }

        return next.handle().pipe(
          tap((body: unknown) => {
            void this.repo.create({
              organizationId,
              endpoint,
              key,
              requestHash,
              responseBody: body ?? {},
            });
          }),
        );
      }),
    );
  }
}
