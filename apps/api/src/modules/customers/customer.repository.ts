import { Injectable } from '@nestjs/common';
import { Prisma, type Customer, type InvoiceStatus } from '@prisma/client';
import type { CustomerListQuery } from '@dashgobo/contracts';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface ListResult {
  data: Customer[];
  totalItems: number;
}

export interface InvoiceStats {
  invoiceCount: number;
  totalInvoiced: bigint;
  lastInvoiceIssuedAt: Date | null;
}

const REVENUE_STATUSES: InvoiceStatus[] = ['AUTHORIZED', 'PAID'];

@Injectable()
export class CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: CustomerListQuery): Promise<ListResult> {
    const where = this.buildWhere(organizationId, query);
    const [data, totalItems] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { data, totalItems };
  }

  findById(organizationId: string, id: string): Promise<Customer | null> {
    return this.prisma.customer.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
  }

  /**
   * Same lookup but ignores `deletedAt` — an invoice references a customer
   * for its whole life, including when authorizing one drafted before the
   * customer was later deactivated.
   */
  findAny(organizationId: string, id: string): Promise<Customer | null> {
    return this.prisma.customer.findFirst({ where: { id, organizationId } });
  }

  create(
    organizationId: string,
    data: Prisma.CustomerCreateWithoutOrganizationInput,
  ): Promise<Customer> {
    return this.prisma.customer.create({
      data: { ...data, organization: { connect: { id: organizationId } } },
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: Prisma.CustomerUpdateManyMutationInput,
  ): Promise<Customer> {
    // `updateMany` + re-fetch keeps the org scope inside the WHERE clause (an
    // `update` by primary key alone would let a valid customer id from another
    // organization silently succeed).
    const result = await this.prisma.customer.updateMany({
      where: { id, organizationId, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: Prisma.prismaVersion.client,
      });
    }
    return this.prisma.customer.findUniqueOrThrow({ where: { id } });
  }

  async softDelete(organizationId: string, id: string): Promise<void> {
    const result = await this.prisma.customer.updateMany({
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

  async getInvoiceStats(organizationId: string, customerId: string): Promise<InvoiceStats> {
    const [aggregate, last] = await this.prisma.$transaction([
      this.prisma.invoice.aggregate({
        where: { organizationId, customerId, status: { in: REVENUE_STATUSES } },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.invoice.findFirst({
        where: { organizationId, customerId, status: { in: REVENUE_STATUSES } },
        orderBy: { issuedAt: 'desc' },
        select: { issuedAt: true },
      }),
    ]);
    return {
      invoiceCount: aggregate._count,
      totalInvoiced: aggregate._sum.total ?? 0n,
      lastInvoiceIssuedAt: last?.issuedAt ?? null,
    };
  }

  private buildWhere(organizationId: string, query: CustomerListQuery): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = { organizationId, deletedAt: null };
    if (query.documentType) where.documentType = query.documentType;
    if (query.taxCondition) where.taxCondition = query.taxCondition;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { legalName: { contains: query.search, mode: 'insensitive' } },
        { documentNumber: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}
