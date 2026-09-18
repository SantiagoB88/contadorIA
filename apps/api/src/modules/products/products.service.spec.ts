import { Prisma, type Product } from '@prisma/client';
import { ProductsService } from './products.service';
import type { ProductRepository } from './product.repository';
import type { AuditService } from '../audit/audit.service';
import { ProductNotFoundError } from '../../common/errors';

const now = new Date('2026-01-01T00:00:00.000Z');
const ORG_ID = 'org-1';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    organizationId: ORG_ID,
    name: 'Consultoría',
    description: null,
    sku: null,
    type: 'SERVICE',
    unitPrice: 150_000n,
    currency: 'ARS',
    taxRate: new Prisma.Decimal(21),
    active: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

interface Mocks {
  repo: jest.Mocked<
    Pick<ProductRepository, 'list' | 'findById' | 'create' | 'update' | 'softDelete'>
  >;
  audit: jest.Mocked<Pick<AuditService, 'record'>>;
}

function build(): { service: ProductsService; m: Mocks } {
  const m: Mocks = {
    repo: {
      list: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn().mockResolvedValue(undefined),
    },
    audit: { record: jest.fn().mockResolvedValue(undefined) },
  };
  const service = new ProductsService(
    m.repo as unknown as ProductRepository,
    m.audit as unknown as AuditService,
  );
  return { service, m };
}

const listQuery = { page: 1, pageSize: 20, order: 'desc' as const, sort: 'createdAt' as const };

describe('ProductsService.list', () => {
  it('paginates and maps money/decimal fields to wire-safe types', async () => {
    const { service, m } = build();
    m.repo.list.mockResolvedValue({ data: [makeProduct()], totalItems: 1 });

    const result = await service.list(ORG_ID, listQuery);

    expect(result.data[0]).toMatchObject({ unitPrice: '150000', taxRate: 21 });
    expect(result.meta.totalItems).toBe(1);
  });
});

describe('ProductsService.getById', () => {
  it('throws ProductNotFoundError when missing in this org', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(null);

    await expect(service.getById(ORG_ID, 'missing')).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});

describe('ProductsService.create', () => {
  it('converts unitPrice to BigInt before persisting and audits', async () => {
    const { service, m } = build();
    m.repo.create.mockResolvedValue(makeProduct());

    const result = await service.create(ORG_ID, 'user-1', {
      name: 'Consultoría',
      type: 'SERVICE',
      unitPrice: 150_000,
      currency: 'ARS',
      taxRate: 21,
    });

    expect(m.repo.create).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ unitPrice: 150_000n }),
    );
    expect(m.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE_PRODUCT' }),
    );
    expect(result.unitPrice).toBe('150000');
  });
});

describe('ProductsService.update', () => {
  it('throws ProductNotFoundError before touching the repository', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(null);

    await expect(
      service.update(ORG_ID, 'user-1', 'missing', { active: false }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(m.repo.update).not.toHaveBeenCalled();
  });

  it('can deactivate a product without touching other fields', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(makeProduct());
    m.repo.update.mockResolvedValue(makeProduct({ active: false }));

    await service.update(ORG_ID, 'user-1', 'prod-1', { active: false });

    expect(m.repo.update).toHaveBeenCalledWith(ORG_ID, 'prod-1', { active: false });
  });
});

describe('ProductsService.remove', () => {
  it('soft-deletes and audits', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(makeProduct());

    await service.remove(ORG_ID, 'user-1', 'prod-1');

    expect(m.repo.softDelete).toHaveBeenCalledWith(ORG_ID, 'prod-1');
    expect(m.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE_PRODUCT' }),
    );
  });

  it('throws ProductNotFoundError instead of soft-deleting a nonexistent product', async () => {
    const { service, m } = build();
    m.repo.findById.mockResolvedValue(null);

    await expect(service.remove(ORG_ID, 'user-1', 'missing')).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
    expect(m.repo.softDelete).not.toHaveBeenCalled();
  });
});
