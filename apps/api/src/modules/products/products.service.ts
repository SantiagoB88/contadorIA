import { Injectable } from '@nestjs/common';
import type {
  CreateProductRequest,
  Paginated,
  Product,
  ProductListQuery,
  UpdateProductRequest,
} from '@dashgobo/contracts';
import { buildPaginationMeta } from '@dashgobo/contracts';
import { ProductNotFoundError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { ProductRepository } from './product.repository';
import { toProductDto } from './product.mapper';

@Injectable()
export class ProductsService {
  constructor(
    private readonly repo: ProductRepository,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, query: ProductListQuery): Promise<Paginated<Product>> {
    const { data, totalItems } = await this.repo.list(organizationId, query);
    return {
      data: data.map(toProductDto),
      meta: buildPaginationMeta(query.page, query.pageSize, totalItems),
    };
  }

  async getById(organizationId: string, id: string): Promise<Product> {
    const row = await this.repo.findById(organizationId, id);
    if (!row) throw new ProductNotFoundError(id);
    return toProductDto(row);
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateProductRequest,
  ): Promise<Product> {
    const row = await this.repo.create(organizationId, {
      name: dto.name,
      description: dto.description,
      sku: dto.sku,
      type: dto.type,
      unitPrice: BigInt(dto.unitPrice),
      currency: dto.currency,
      taxRate: dto.taxRate,
    });
    await this.audit.record({
      action: 'CREATE_PRODUCT',
      entity: 'Product',
      entityId: row.id,
      organizationId,
      userId,
      metadata: { name: row.name, sku: row.sku },
    });
    return toProductDto(row);
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateProductRequest,
  ): Promise<Product> {
    const existing = await this.repo.findById(organizationId, id);
    if (!existing) throw new ProductNotFoundError(id);

    const row = await this.repo.update(organizationId, id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.sku !== undefined && { sku: dto.sku }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.unitPrice !== undefined && { unitPrice: BigInt(dto.unitPrice) }),
      ...(dto.currency !== undefined && { currency: dto.currency }),
      ...(dto.taxRate !== undefined && { taxRate: dto.taxRate }),
      ...(dto.active !== undefined && { active: dto.active }),
    });
    await this.audit.record({
      action: 'UPDATE_PRODUCT',
      entity: 'Product',
      entityId: id,
      organizationId,
      userId,
      metadata: { fields: Object.keys(dto) },
    });
    return toProductDto(row);
  }

  async remove(organizationId: string, userId: string, id: string): Promise<void> {
    const existing = await this.repo.findById(organizationId, id);
    if (!existing) throw new ProductNotFoundError(id);

    await this.repo.softDelete(organizationId, id);
    await this.audit.record({
      action: 'DELETE_PRODUCT',
      entity: 'Product',
      entityId: id,
      organizationId,
      userId,
    });
  }
}
