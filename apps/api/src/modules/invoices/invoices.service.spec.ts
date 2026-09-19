import { Prisma, type Customer, type Invoice, type Product } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import type { InvoiceRepository, InvoiceWithItems } from './invoice.repository';
import type { CustomerRepository } from '../customers/customer.repository';
import type { ProductRepository } from '../products/product.repository';
import type { OrganizationRepository } from '../organizations/organization.repository';
import type { AuditService } from '../audit/audit.service';
import type { InvoiceProvider } from './providers/invoice-provider.interface';
import {
  CustomerNotFoundError,
  ForbiddenError,
  InvalidInvoiceStateError,
  InvoiceAlreadyAuthorizedError,
  InvoiceProviderError,
  ProductNotFoundError,
} from '../../common/errors';

const now = new Date('2026-01-01T00:00:00.000Z');
const ORG_ID = 'org-1';

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cus-1',
    organizationId: ORG_ID,
    name: 'Acme SRL',
    legalName: null,
    documentType: 'CUIT',
    documentNumber: '20123456783',
    taxCondition: 'RESPONSABLE_INSCRIPTO',
    email: null,
    phone: null,
    address: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    organizationId: ORG_ID,
    name: 'Consultoría',
    description: null,
    sku: null,
    type: 'SERVICE',
    unitPrice: 100_00n,
    currency: 'ARS',
    taxRate: new Prisma.Decimal(21),
    active: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeInvoiceRow(overrides: Partial<Invoice> = {}): InvoiceWithItems {
  return {
    id: 'inv-1',
    organizationId: ORG_ID,
    customerId: 'cus-1',
    status: 'DRAFT',
    invoiceType: 'B',
    pointOfSale: 1,
    invoiceNumber: null,
    currency: 'ARS',
    subtotal: 100_00n,
    taxes: 21_00n,
    total: 121_00n,
    cae: null,
    caeExpiration: null,
    externalId: null,
    notes: null,
    issuedAt: null,
    createdAt: now,
    updatedAt: now,
    items: [],
    customer: { name: 'Acme SRL' },
    ...overrides,
  };
}

interface Mocks {
  repo: jest.Mocked<
    Pick<
      InvoiceRepository,
      'list' | 'findById' | 'createDraft' | 'markPending' | 'markAuthorized' | 'markError'
    >
  >;
  customers: jest.Mocked<Pick<CustomerRepository, 'findById' | 'findAny'>>;
  products: jest.Mocked<Pick<ProductRepository, 'findById'>>;
  organizations: jest.Mocked<Pick<OrganizationRepository, 'findById'>>;
  provider: jest.Mocked<InvoiceProvider>;
  audit: jest.Mocked<Pick<AuditService, 'record'>>;
}

function build(): { service: InvoicesService; m: Mocks } {
  const m: Mocks = {
    repo: {
      list: jest.fn(),
      findById: jest.fn(),
      createDraft: jest.fn(),
      markPending: jest.fn(),
      markAuthorized: jest.fn(),
      markError: jest.fn().mockResolvedValue(undefined),
    },
    customers: { findById: jest.fn(), findAny: jest.fn() },
    products: { findById: jest.fn() },
    organizations: { findById: jest.fn() },
    provider: {
      authorizeInvoice: jest.fn(),
      getInvoice: jest.fn(),
      getLastAuthorizedInvoice: jest.fn(),
      validateCredentials: jest.fn(),
    },
    audit: { record: jest.fn().mockResolvedValue(undefined) },
  };

  const service = new InvoicesService(
    m.repo as unknown as InvoiceRepository,
    m.customers as unknown as CustomerRepository,
    m.products as unknown as ProductRepository,
    m.organizations as unknown as OrganizationRepository,
    m.provider,
    m.audit as unknown as AuditService,
  );
  return { service, m };
}

describe('InvoicesService.create', () => {
  it('rejects an unknown customer', async () => {
    const { service, m } = build();
    m.customers.findById.mockResolvedValue(null);

    await expect(
      service.create(ORG_ID, 'user-1', 'OWNER', {
        customerId: 'missing',
        invoiceType: 'B',
        pointOfSale: 1,
        items: [{ productId: 'p1', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  it('prices a catalog item from the product and recomputes totals server-side', async () => {
    const { service, m } = build();
    m.customers.findById.mockResolvedValue(makeCustomer());
    m.products.findById.mockResolvedValue(makeProduct());
    m.repo.createDraft.mockResolvedValue(makeInvoiceRow());

    await service.create(ORG_ID, 'user-1', 'OPERATOR', {
      customerId: 'cus-1',
      invoiceType: 'B',
      pointOfSale: 1,
      items: [{ productId: 'prod-1', quantity: 2 }],
    });

    expect(m.repo.createDraft).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest's ObjectContaining<T> types as `any`
        computed: expect.objectContaining({ subtotal: 200_00n, taxes: 42_00n, total: 242_00n }),
      }),
    );
    expect(m.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE_INVOICE' }),
    );
  });

  it('blocks a role without override permission from changing a catalog price', async () => {
    const { service, m } = build();
    m.customers.findById.mockResolvedValue(makeCustomer());
    m.products.findById.mockResolvedValue(makeProduct({ unitPrice: 100_00n }));

    await expect(
      service.create(ORG_ID, 'user-1', 'OPERATOR', {
        customerId: 'cus-1',
        invoiceType: 'B',
        pointOfSale: 1,
        items: [{ productId: 'prod-1', quantity: 1, unitPrice: 1 }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(m.repo.createDraft).not.toHaveBeenCalled();
  });

  it('allows a role with override permission to change a catalog price', async () => {
    const { service, m } = build();
    m.customers.findById.mockResolvedValue(makeCustomer());
    m.products.findById.mockResolvedValue(
      makeProduct({ unitPrice: 100_00n, taxRate: new Prisma.Decimal(21) }),
    );
    m.repo.createDraft.mockResolvedValue(makeInvoiceRow());

    await service.create(ORG_ID, 'user-1', 'ACCOUNTANT', {
      customerId: 'cus-1',
      invoiceType: 'B',
      pointOfSale: 1,
      items: [{ productId: 'prod-1', quantity: 1, unitPrice: 50_00 }],
    });

    expect(m.repo.createDraft).toHaveBeenCalledWith(
      ORG_ID,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest's ObjectContaining<T> types as `any`
      expect.objectContaining({ computed: expect.objectContaining({ subtotal: 50_00n }) }),
    );
  });

  it('blocks an operator from adding an ad-hoc (no productId) item', async () => {
    const { service, m } = build();
    m.customers.findById.mockResolvedValue(makeCustomer());

    await expect(
      service.create(ORG_ID, 'user-1', 'OPERATOR', {
        customerId: 'cus-1',
        invoiceType: 'B',
        pointOfSale: 1,
        items: [{ description: 'Ad-hoc', quantity: 1, unitPrice: 1000, taxRate: 21 }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects an unknown product', async () => {
    const { service, m } = build();
    m.customers.findById.mockResolvedValue(makeCustomer());
    m.products.findById.mockResolvedValue(null);

    await expect(
      service.create(ORG_ID, 'user-1', 'OWNER', {
        customerId: 'cus-1',
        invoiceType: 'B',
        pointOfSale: 1,
        items: [{ productId: 'missing', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});

describe('InvoicesService.authorize', () => {
  it('transitions DRAFT -> PENDING -> AUTHORIZED and stores the provider result', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(makeInvoiceRow({ status: 'DRAFT' }));
    m.repo.markPending.mockResolvedValue(true);
    m.customers.findAny.mockResolvedValue(makeCustomer());
    m.provider.authorizeInvoice.mockResolvedValue({
      invoiceNumber: 1,
      cae: '12345678901234',
      caeExpiration: now,
      externalId: 'MOCK-1',
    });
    m.repo.markAuthorized.mockResolvedValue(
      makeInvoiceRow({ status: 'AUTHORIZED', invoiceNumber: 1 }),
    );

    const result = await service.authorize(ORG_ID, 'user-1', 'inv-1');

    expect(m.repo.markPending).toHaveBeenCalledWith('inv-1', 'DRAFT');
    expect(m.repo.markAuthorized).toHaveBeenCalled();
    expect(result.status).toBe('AUTHORIZED');
    expect(m.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTHORIZE_INVOICE' }),
    );
  });

  it('rejects re-authorizing an already-AUTHORIZED invoice', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(makeInvoiceRow({ status: 'AUTHORIZED', invoiceNumber: 1 }));

    await expect(service.authorize(ORG_ID, 'user-1', 'inv-1')).rejects.toBeInstanceOf(
      InvoiceAlreadyAuthorizedError,
    );
    expect(m.repo.markPending).not.toHaveBeenCalled();
  });

  it('rejects authorizing a CANCELLED invoice with a state error, not a generic one', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(makeInvoiceRow({ status: 'CANCELLED' }));

    await expect(service.authorize(ORG_ID, 'user-1', 'inv-1')).rejects.toBeInstanceOf(
      InvalidInvoiceStateError,
    );
  });

  it('loses a race for an already-claimed invoice cleanly', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(makeInvoiceRow({ status: 'DRAFT' }));
    m.repo.markPending.mockResolvedValue(false); // someone else claimed it first

    await expect(service.authorize(ORG_ID, 'user-1', 'inv-1')).rejects.toBeInstanceOf(
      InvoiceAlreadyAuthorizedError,
    );
  });

  it('marks the invoice ERROR and surfaces InvoiceProviderError when the provider throws', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(makeInvoiceRow({ status: 'DRAFT' }));
    m.repo.markPending.mockResolvedValue(true);
    m.customers.findAny.mockResolvedValue(makeCustomer());
    m.provider.authorizeInvoice.mockRejectedValue(new Error('AFIP is down'));

    await expect(service.authorize(ORG_ID, 'user-1', 'inv-1')).rejects.toBeInstanceOf(
      InvoiceProviderError,
    );
    expect(m.repo.markError).toHaveBeenCalledWith('inv-1');
    expect(m.repo.markAuthorized).not.toHaveBeenCalled();
  });

  it('retries from ERROR back through PENDING to AUTHORIZED', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(makeInvoiceRow({ status: 'ERROR' }));
    m.repo.markPending.mockResolvedValue(true);
    m.customers.findAny.mockResolvedValue(makeCustomer());
    m.provider.authorizeInvoice.mockResolvedValue({
      invoiceNumber: 1,
      cae: '12345678901234',
      caeExpiration: now,
      externalId: 'MOCK-2',
    });
    m.repo.markAuthorized.mockResolvedValue(
      makeInvoiceRow({ status: 'AUTHORIZED', invoiceNumber: 1 }),
    );

    await service.authorize(ORG_ID, 'user-1', 'inv-1');

    expect(m.repo.markPending).toHaveBeenCalledWith('inv-1', 'ERROR');
  });
});
