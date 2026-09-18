import { describe, expect, it } from 'vitest';
import { buildPaginationMeta, paginationQuerySchema } from './pagination';

describe('paginationQuerySchema', () => {
  it('applies defaults when nothing is provided', () => {
    const parsed = paginationQuerySchema.parse({});
    expect(parsed).toEqual({ page: 1, pageSize: 20, order: 'desc' });
  });

  it('coerces string query params to numbers', () => {
    const parsed = paginationQuerySchema.parse({ page: '3', pageSize: '50' });
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
  });

  it('rejects a pageSize above the hard limit', () => {
    expect(() => paginationQuerySchema.parse({ pageSize: '500' })).toThrow();
  });
});

describe('buildPaginationMeta', () => {
  it('computes total pages and navigation flags', () => {
    const meta = buildPaginationMeta(2, 20, 45);
    expect(meta.totalPages).toBe(3);
    expect(meta.hasNextPage).toBe(true);
    expect(meta.hasPreviousPage).toBe(true);
  });

  it('handles an empty result set', () => {
    const meta = buildPaginationMeta(1, 20, 0);
    expect(meta.totalPages).toBe(0);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(false);
  });
});
