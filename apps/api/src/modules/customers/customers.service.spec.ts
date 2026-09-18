import type { Customer } from '@prisma/client';
import { CustomersService } from './customers.service';
import type { CustomerRepository, InvoiceStats } from './customer.repository';
import type { AuditService } from '../audit/audit.service';
import { CustomerNotFoundError } from '../../common/errors';

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

interface Mocks {
  repo: jest.Mocked<
    Pick<
      CustomerRepository,
      'list' | 'findById' | 'create' | 'update' | 'softDelete' | 'getInvoiceStats'
    >
  >;
  audit: jest.Mocked<Pick<AuditService, 'record'>>;
}

function build(): { service: CustomersService; m: Mocks } {
  const m: Mocks = {
    repo: {
      list: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn().mockResolvedValue(undefined),
      getInvoiceStats: jest.fn(),
    },
    audit: { record: jest.fn().mockResolvedValue(undefined) },
  };
  const service = new CustomersService(
    m.repo as unknown as CustomerRepository,
    m.audit as unknown as AuditService,
  );
  return { service, m };
}

const listQuery = { page: 1, pageSize: 20, order: 'desc' as const, sort: 'createdAt' as const };

describe('CustomersService.list', () => {
  it('paginates and maps rows for the target organization', async () => {
    const { service, m } = build();
    m.repo.list.mockResolvedValue({ data: [makeCustomer()], totalItems: 1 });

    const result = await service.list(ORG_ID, listQuery);

    expect(m.repo.list).toHaveBeenCalledWith(ORG_ID, listQuery);
    expect(result.data).toHaveLength(1);
    expect(result.meta).toMatchObject({ totalItems: 1, page: 1, pageSize: 20 });
  });
});

describe('CustomersService.getById', () => {
  it('throws CustomerNotFoundError when the customer does not exist in this org', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(null);

    await expect(service.getById(ORG_ID, 'missing')).rejects.toBeInstanceOf(CustomerNotFoundError);
    expect(m.repo.getInvoiceStats).not.toHaveBeenCalled();
  });

  it('merges invoicing stats into the detail response', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(makeCustomer());
    const stats: InvoiceStats = {
      invoiceCount: 3,
      totalInvoiced: 150_000n,
      lastInvoiceIssuedAt: now,
    };
    m.repo.getInvoiceStats.mockResolvedValue(stats);

    const result = await service.getById(ORG_ID, 'cus-1');

    expect(result.invoiceCount).toBe(3);
    expect(result.totalInvoiced).toBe('150000');
    expect(result.lastInvoiceIssuedAt).toBe(now.toISOString());
  });
});

describe('CustomersService.create', () => {
  it('creates the customer scoped to the org and records an audit entry', async () => {
    const { service, m } = build();
    m.repo.create.mockResolvedValue(makeCustomer());

    const result = await service.create(ORG_ID, 'user-1', {
      name: 'Acme SRL',
      documentType: 'CUIT',
      documentNumber: '20123456783',
      taxCondition: 'RESPONSABLE_INSCRIPTO',
    });

    expect(m.repo.create).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ name: 'Acme SRL' }),
    );
    expect(m.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE_CUSTOMER', organizationId: ORG_ID }),
    );
    expect(result.name).toBe('Acme SRL');
  });
});

describe('CustomersService.update', () => {
  it('throws CustomerNotFoundError before touching the repository update', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(null);

    await expect(service.update(ORG_ID, 'user-1', 'missing', { name: 'X' })).rejects.toBeInstanceOf(
      CustomerNotFoundError,
    );
    expect(m.repo.update).not.toHaveBeenCalled();
  });

  it('only forwards fields present in the DTO', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(makeCustomer());
    m.repo.update.mockResolvedValue(makeCustomer({ name: 'Nuevo nombre' }));

    await service.update(ORG_ID, 'user-1', 'cus-1', { name: 'Nuevo nombre' });

    expect(m.repo.update).toHaveBeenCalledWith(ORG_ID, 'cus-1', { name: 'Nuevo nombre' });
  });
});

describe('CustomersService.remove', () => {
  it('throws CustomerNotFoundError instead of soft-deleting a nonexistent customer', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(null);

    await expect(service.remove(ORG_ID, 'user-1', 'missing')).rejects.toBeInstanceOf(
      CustomerNotFoundError,
    );
    expect(m.repo.softDelete).not.toHaveBeenCalled();
  });

  it('soft-deletes and audits', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(makeCustomer());

    await service.remove(ORG_ID, 'user-1', 'cus-1');

    expect(m.repo.softDelete).toHaveBeenCalledWith(ORG_ID, 'cus-1');
    expect(m.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE_CUSTOMER' }),
    );
  });
});
