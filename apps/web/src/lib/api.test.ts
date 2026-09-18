import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './api';

describe('ApiRequestError', () => {
  it('exposes the canonical error code when the API returned one', () => {
    const error = new ApiRequestError(
      404,
      { error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found', details: {} } },
      'Customer not found',
    );
    expect(error.code).toBe('CUSTOMER_NOT_FOUND');
    expect(error.status).toBe(404);
  });

  it('has an undefined code when there is no structured payload', () => {
    const error = new ApiRequestError(500, null, 'Request failed (500)');
    expect(error.code).toBeUndefined();
  });
});
