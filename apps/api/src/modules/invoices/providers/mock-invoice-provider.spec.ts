import { MockInvoiceProvider } from './mock-invoice-provider';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';

const ORG_ID = 'org-1';

function makePrismaStub(lastInvoiceNumber: number | null) {
  return {
    invoice: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          lastInvoiceNumber === null ? null : { invoiceNumber: lastInvoiceNumber },
        ),
    },
  } as unknown as PrismaService;
}

describe('MockInvoiceProvider', () => {
  it('starts numbering at 1 when nothing was authorized yet for this point of sale', async () => {
    const provider = new MockInvoiceProvider(makePrismaStub(null));

    const result = await provider.authorizeInvoice({
      organizationId: ORG_ID,
      invoiceType: 'B',
      pointOfSale: 1,
      subtotal: 100_00n,
      taxes: 21_00n,
      total: 121_00n,
      currency: 'ARS',
      customerDocumentType: 'CUIT',
      customerDocumentNumber: '20123456783',
    });

    expect(result.invoiceNumber).toBe(1);
    expect(result.cae).toMatch(/^\d{14}$/);
    expect(result.externalId).toMatch(/^MOCK-/);
    expect(result.caeExpiration.getTime()).toBeGreaterThan(Date.now());
  });

  it('continues numbering from the last authorized invoice for that point of sale/type', async () => {
    const provider = new MockInvoiceProvider(makePrismaStub(41));

    const result = await provider.authorizeInvoice({
      organizationId: ORG_ID,
      invoiceType: 'B',
      pointOfSale: 1,
      subtotal: 100_00n,
      taxes: 21_00n,
      total: 121_00n,
      currency: 'ARS',
      customerDocumentType: 'CUIT',
      customerDocumentNumber: '20123456783',
    });

    expect(result.invoiceNumber).toBe(42);
  });

  it('always reports credentials as valid (nothing to validate for a mock)', async () => {
    const provider = new MockInvoiceProvider(makePrismaStub(null));
    await expect(provider.validateCredentials(ORG_ID)).resolves.toBe(true);
  });
});
