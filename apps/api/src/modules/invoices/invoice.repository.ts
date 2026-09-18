import { Injectable } from '@nestjs/common';
import { Prisma, type Invoice, type InvoiceStatus, type InvoiceType } from '@prisma/client';
import type { InvoiceListQuery } from '@dashgobo/contracts';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { ComputedInvoice } from './domain/invoice-calculator';
import type { AuthorizeInvoiceResult } from './providers/invoice-provider.interface';

export type InvoiceWithItems = Prisma.InvoiceGetPayload<{ include: { items: true } }>;

export interface ListResult {
  data: Invoice[];
  totalItems: number;
}

export interface CreateDraftInput {
  customerId: string;
  invoiceType: InvoiceType;
  pointOfSale: number;
  currency: string;
  notes?: string;
  computed: ComputedInvoice;
}

@Injectable()
export class InvoiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  createDraft(organizationId: string, input: CreateDraftInput): Promise<InvoiceWithItems> {
    return this.prisma.invoice.create({
      data: {
        organizationId,
        customerId: input.customerId,
        invoiceType: input.invoiceType,
        pointOfSale: input.pointOfSale,
        currency: input.currency,
        notes: input.notes,
        status: 'DRAFT',
        subtotal: input.computed.subtotal,
        taxes: input.computed.taxes,
        total: input.computed.total,
        items: {
          create: input.computed.items.map((item) => ({
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            subtotal: item.subtotal,
            total: item.total,
          })),
        },
      },
      include: { items: true },
    });
  }

  findById(organizationId: string, id: string): Promise<InvoiceWithItems | null> {
    return this.prisma.invoice.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
  }

  async list(organizationId: string, query: InvoiceListQuery): Promise<ListResult> {
    const where = this.buildWhere(organizationId, query);
    const [data, totalItems] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { data, totalItems };
  }

  /**
   * Claims the invoice for authorization. Scoped by the expected current
   * status (`fromStatus`) so two concurrent authorize attempts can't both
   * "win" the DRAFT/ERROR -> PENDING transition.
   */
  async markPending(id: string, fromStatus: InvoiceStatus): Promise<boolean> {
    const result = await this.prisma.invoice.updateMany({
      where: { id, status: fromStatus },
      data: { status: 'PENDING' },
    });
    return result.count === 1;
  }

  markAuthorized(id: string, result: AuthorizeInvoiceResult): Promise<InvoiceWithItems> {
    return this.prisma.invoice.update({
      where: { id },
      data: {
        status: 'AUTHORIZED',
        invoiceNumber: result.invoiceNumber,
        cae: result.cae,
        caeExpiration: result.caeExpiration,
        externalId: result.externalId,
        issuedAt: new Date(),
      },
      include: { items: true },
    });
  }

  async markError(id: string): Promise<void> {
    await this.prisma.invoice.update({ where: { id }, data: { status: 'ERROR' } });
  }

  private buildWhere(organizationId: string, query: InvoiceListQuery): Prisma.InvoiceWhereInput {
    const where: Prisma.InvoiceWhereInput = { organizationId };
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = query.customerId;
    if (query.invoiceType) where.invoiceType = query.invoiceType;
    return where;
  }
}
