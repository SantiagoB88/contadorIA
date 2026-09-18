import { describe, expect, it } from 'vitest';
import { createCustomerRequestSchema } from './customers';

describe('createCustomerRequestSchema', () => {
  it('accepts a valid CUIT', () => {
    const result = createCustomerRequestSchema.safeParse({
      name: 'Acme SRL',
      documentType: 'CUIT',
      documentNumber: '20-12345678-3',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a CUIT that is not 11 digits', () => {
    const result = createCustomerRequestSchema.safeParse({
      name: 'Acme SRL',
      documentType: 'CUIT',
      documentNumber: '123',
    });
    expect(result.success).toBe(false);
  });

  it('applies defaults for documentType and taxCondition', () => {
    const result = createCustomerRequestSchema.parse({
      name: 'Juan Perez',
      documentNumber: '20-12345678-3',
    });
    expect(result.documentType).toBe('CUIT');
    expect(result.taxCondition).toBe('CONSUMIDOR_FINAL');
  });

  it('rejects a DNI outside the 6-9 digit range', () => {
    const result = createCustomerRequestSchema.safeParse({
      name: 'Juan Perez',
      documentType: 'DNI',
      documentNumber: '12',
    });
    expect(result.success).toBe(false);
  });
});
