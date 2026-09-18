import { Injectable } from '@nestjs/common';
import { Prisma, type Product } from '@prisma/client';
import type { ProductListQuery } from '@dashgobo/contracts';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface ListResult {
  data: Product[];
  totalItems: number;
}

@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: ProductListQuery): Promise<ListResult> {
    const where = this.buildWhere(organizationId, query);
    const [data, totalItems] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { data, totalItems };
  }

  findById(organizationId: string, id: string): Promise<Product | null> {
    return this.prisma.product.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
  }

  create(
    organizationId: string,
    data: Prisma.ProductCreateWithoutOrganizationInput,
  ): Promise<Product> {
    return this.prisma.product.create({
      data: { ...data, organization: { connect: { id: organizationId } } },
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: Prisma.ProductUpdateManyMutationInput,
  ): Promise<Product> {
    // See CustomerRepository.update: updateMany keeps the org scope inside
    // the WHERE clause instead of trusting a bare primary-key update.
    const result = await this.prisma.product.updateMany({
      where: { id, organizationId, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: Prisma.prismaVersion.client,
      });
    }
    return this.prisma.product.findUniqueOrThrow({ where: { id } });
  }

  async softDelete(organizationId: string, id: string): Promise<void> {
    const result = await this.prisma.product.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: Prisma.prismaVersion.client,
      });
    }
  }

  private buildWhere(organizationId: string, query: ProductListQuery): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { organizationId, deletedAt: null };
    if (query.type) where.type = query.type;
    if (query.active !== undefined) where.active = query.active;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}
