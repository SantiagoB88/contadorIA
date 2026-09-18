import { computeInvoiceTotals, type ResolvedInvoiceItem } from './invoice-calculator';

function item(overrides: Partial<ResolvedInvoiceItem> = {}): ResolvedInvoiceItem {
  return {
    productId: null,
    description: 'Item',
    quantity: 1,
    unitPrice: 100_00n,
    taxRate: 21,
    ...overrides,
  };
}

describe('computeInvoiceTotals', () => {
  it('computes subtotal, tax and total for a single whole-quantity item', () => {
    const result = computeInvoiceTotals([item({ unitPrice: 1_000_00n, quantity: 1, taxRate: 21 })]);

    expect(result.subtotal).toBe(1_000_00n);
    expect(result.taxes).toBe(210_00n);
    expect(result.total).toBe(1_210_00n);
  });

  it('sums multiple items independently', () => {
    const result = computeInvoiceTotals([
      item({ unitPrice: 1_000_00n, quantity: 2, taxRate: 21 }), // 2000.00 + 420.00
      item({ unitPrice: 500_00n, quantity: 1, taxRate: 10.5 }), // 500.00 + 52.50
    ]);

    expect(result.subtotal).toBe(2_500_00n);
    expect(result.taxes).toBe(472_50n);
    expect(result.total).toBe(2_972_50n);
  });

  it('rounds a fractional quantity to the nearest minor unit', () => {
    // 33.33 * 3 = 99.99 exactly in cents -> no rounding surprise here, but
    // a fractional unit price times a fractional quantity does need rounding.
    const result = computeInvoiceTotals([item({ unitPrice: 333n, quantity: 3.5, taxRate: 0 })]);

    expect(result.subtotal).toBe(1166n); // 333 * 3.5 = 1165.5 -> rounds to 1166
    expect(result.total).toBe(1166n);
  });

  it('returns zero totals for an empty item list', () => {
    const result = computeInvoiceTotals([]);
    expect(result.subtotal).toBe(0n);
    expect(result.taxes).toBe(0n);
    expect(result.total).toBe(0n);
  });

  it('handles a 0% tax rate item', () => {
    const result = computeInvoiceTotals([item({ unitPrice: 500_00n, quantity: 1, taxRate: 0 })]);
    expect(result.taxes).toBe(0n);
    expect(result.total).toBe(500_00n);
  });
});
