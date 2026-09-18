import { describe, expect, it } from 'vitest';
import { createInvoiceRequestSchema } from './invoices';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

describe('createInvoiceRequestSchema', () => {
  it('accepts an item that references a catalog product with no price', () => {
    const result = createInvoiceRequestSchema.safeParse({
      customerId: CUSTOMER_ID,
      items: [{ productId: PRODUCT_ID, quantity: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an ad-hoc item (no productId) missing description/unitPrice/taxRate', () => {
    const result = createInvoiceRequestSchema.safeParse({
      customerId: CUSTOMER_ID,
      items: [{ quantity: 1 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toEqual(
        expect.arrayContaining(['items.0.description', 'items.0.unitPrice', 'items.0.taxRate']),
      );
    }
  });

  it('accepts a fully specified ad-hoc item', () => {
    const result = createInvoiceRequestSchema.safeParse({
      customerId: CUSTOMER_ID,
      items: [{ description: 'Servicio puntual', quantity: 1, unitPrice: 10_000, taxRate: 21 }],
    });
    expect(result.success).toBe(true);
  });

  it('defaults invoiceType to B and pointOfSale to 1', () => {
    const result = createInvoiceRequestSchema.parse({
      customerId: CUSTOMER_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    });
    expect(result.invoiceType).toBe('B');
    expect(result.pointOfSale).toBe(1);
  });

  it('rejects an empty items array', () => {
    const result = createInvoiceRequestSchema.safeParse({ customerId: CUSTOMER_ID, items: [] });
    expect(result.success).toBe(false);
  });
});
