import type { Invoice as InvoiceRow, InvoiceItem as InvoiceItemRow } from '@prisma/client';
import type { Invoice, InvoiceDetail, InvoiceItemDto } from '@dashgobo/contracts';
import type { InvoiceWithItems } from './invoice.repository';

export function toInvoiceDto(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    organizationId: row.organizationId,
    customerId: row.customerId,
    status: row.status,
    invoiceType: row.invoiceType,
    pointOfSale: row.pointOfSale,
    invoiceNumber: row.invoiceNumber,
    currency: row.currency,
    subtotal: row.subtotal.toString(),
    taxes: row.taxes.toString(),
    total: row.total.toString(),
    cae: row.cae,
    caeExpiration: row.caeExpiration?.toISOString() ?? null,
    externalId: row.externalId,
    notes: row.notes,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toInvoiceItemDto(row: InvoiceItemRow): InvoiceItemDto {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    productId: row.productId,
    description: row.description,
    quantity: row.quantity.toString(),
    unitPrice: row.unitPrice.toString(),
    taxRate: row.taxRate.toNumber(),
    subtotal: row.subtotal.toString(),
    total: row.total.toString(),
  };
}

export function toInvoiceDetailDto(row: InvoiceWithItems): InvoiceDetail {
  return {
    ...toInvoiceDto(row),
    items: row.items.map(toInvoiceItemDto),
  };
}
