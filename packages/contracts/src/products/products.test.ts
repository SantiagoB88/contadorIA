import { describe, expect, it } from 'vitest';
import { createProductRequestSchema } from './products';

describe('createProductRequestSchema', () => {
  it('applies defaults for type, currency and taxRate', () => {
    const result = createProductRequestSchema.parse({ name: 'Consultoría', unitPrice: 150000 });
    expect(result.type).toBe('SERVICE');
    expect(result.currency).toBe('ARS');
    expect(result.taxRate).toBe(21);
  });

  it('rejects a negative unit price', () => {
    const result = createProductRequestSchema.safeParse({ name: 'X', unitPrice: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a tax rate above 100', () => {
    const result = createProductRequestSchema.safeParse({
      name: 'X',
      unitPrice: 100,
      taxRate: 150,
    });
    expect(result.success).toBe(false);
  });

  it('accepts an explicit GOOD product with a sku', () => {
    const result = createProductRequestSchema.safeParse({
      name: 'Notebook',
      type: 'GOOD',
      sku: 'NB-001',
      unitPrice: 250_000_00,
    });
    expect(result.success).toBe(true);
  });
});
