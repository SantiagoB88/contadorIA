import { type CallHandler, type ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import type { IdempotencyKey } from '@prisma/client';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import type { IdempotencyKeyRepository } from './idempotency-key.repository';
import { IdempotencyKeyConflictError } from '../errors';
import { stableHash } from './stable-hash';

const ORG_ID = 'org-1';

function contextFor(
  headers: Record<string, string>,
  orgContext?: { organizationId: string },
  body: unknown = { foo: 'bar' },
) {
  const request = { headers, body, orgContext };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getClass: () => ({ name: 'InvoicesController' }),
    getHandler: () => ({ name: 'create' }),
  } as unknown as ExecutionContext;
}

function handlerReturning(value: unknown): CallHandler {
  return { handle: jest.fn(() => of(value)) };
}

function makeStoredKey(overrides: Partial<IdempotencyKey> = {}): IdempotencyKey {
  return {
    id: 'idk-1',
    organizationId: ORG_ID,
    endpoint: 'InvoicesController.create',
    key: 'client-key-1',
    requestHash: stableHash({ foo: 'bar' }), // matches the body `contextFor` sends by default
    responseBody: { cached: true },
    createdAt: new Date(),
    ...overrides,
  };
}

describe('IdempotencyInterceptor', () => {
  it('passes through untouched when there is no Idempotency-Key header', async () => {
    const repo = { findByKey: jest.fn(), create: jest.fn() } as unknown as IdempotencyKeyRepository;
    const interceptor = new IdempotencyInterceptor(repo);
    const handler = handlerReturning({ id: 'inv-1' });

    const result = await firstValueFrom(
      interceptor.intercept(contextFor({}, { organizationId: ORG_ID }), handler),
    );

    expect(handler.handle).toHaveBeenCalled();
    expect(repo.findByKey).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'inv-1' });
  });

  it('runs the handler and stores the response for an unseen key', async () => {
    const repo = {
      findByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
    } as unknown as IdempotencyKeyRepository;
    const interceptor = new IdempotencyInterceptor(repo);
    const handler = handlerReturning({ id: 'inv-1' });

    const result = await firstValueFrom(
      interceptor.intercept(
        contextFor({ 'idempotency-key': 'client-key-1' }, { organizationId: ORG_ID }),
        handler,
      ),
    );

    expect(handler.handle).toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, key: 'client-key-1' }),
    );
    expect(result).toEqual({ id: 'inv-1' });
  });

  it('replays the stored response for a retried request and never re-runs the handler', async () => {
    const repo = {
      findByKey: jest.fn().mockResolvedValue(makeStoredKey()),
      create: jest.fn(),
    } as unknown as IdempotencyKeyRepository;
    const interceptor = new IdempotencyInterceptor(repo);
    const handler = handlerReturning({ id: 'a-new-invoice-that-should-never-be-created' });

    const result = await firstValueFrom(
      interceptor.intercept(
        contextFor({ 'idempotency-key': 'client-key-1' }, { organizationId: ORG_ID }),
        handler,
      ),
    );

    expect(handler.handle).not.toHaveBeenCalled();
    expect(result).toEqual({ cached: true });
  });

  it('rejects reusing the same key for a different request body', async () => {
    const repo = {
      findByKey: jest.fn().mockResolvedValue(makeStoredKey({ requestHash: 'a-different-hash' })),
      create: jest.fn(),
    } as unknown as IdempotencyKeyRepository;
    const interceptor = new IdempotencyInterceptor(repo);
    const handler = handlerReturning({ id: 'inv-1' });

    await expect(
      firstValueFrom(
        interceptor.intercept(
          contextFor({ 'idempotency-key': 'client-key-1' }, { organizationId: ORG_ID }),
          handler,
        ),
      ),
    ).rejects.toBeInstanceOf(IdempotencyKeyConflictError);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('handles a bodyless request (e.g. POST .../authorize) without throwing', async () => {
    const repo = {
      findByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
    } as unknown as IdempotencyKeyRepository;
    const interceptor = new IdempotencyInterceptor(repo);
    const handler = handlerReturning({ id: 'inv-1', status: 'AUTHORIZED' });

    const result = await firstValueFrom(
      interceptor.intercept(
        contextFor({ 'idempotency-key': 'client-key-1' }, { organizationId: ORG_ID }, undefined),
        handler,
      ),
    );

    expect(handler.handle).toHaveBeenCalled();
    expect(result).toEqual({ id: 'inv-1', status: 'AUTHORIZED' });
  });
});
