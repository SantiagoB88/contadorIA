import { describe, expect, it } from 'vitest';
import { previewInvoiceTotals } from './invoice-preview';

describe('previewInvoiceTotals', () => {
  it('computes subtotal, taxes and total for a single line', () => {
    const result = previewInvoiceTotals([{ quantity: 2, unitPrice: 1_000_00, taxRate: 21 }]);
    expect(result).toEqual({ subtotal: 200_000, taxes: 42_000, total: 242_000 });
  });

  it('sums multiple lines independently', () => {
    const result = previewInvoiceTotals([
      { quantity: 1, unitPrice: 500_00, taxRate: 21 },
      { quantity: 1, unitPrice: 500_00, taxRate: 10.5 },
    ]);
    expect(result.subtotal).toBe(100_000);
    expect(result.total).toBe(100_000 + 10_500 + 5_250);
  });

  it('returns zero totals for no lines', () => {
    expect(previewInvoiceTotals([])).toEqual({ subtotal: 0, taxes: 0, total: 0 });
  });
});
