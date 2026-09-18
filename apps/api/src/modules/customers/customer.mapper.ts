import type { Customer as CustomerRow } from '@prisma/client';
import type { Customer, CustomerDetail } from '@dashgobo/contracts';
import type { InvoiceStats } from './customer.repository';

export function toCustomerDto(row: CustomerRow): Customer {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    legalName: row.legalName,
    documentType: row.documentType,
    documentNumber: row.documentNumber,
    taxCondition: row.taxCondition,
    email: row.email,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCustomerDetailDto(row: CustomerRow, stats: InvoiceStats): CustomerDetail {
  return {
    ...toCustomerDto(row),
    invoiceCount: stats.invoiceCount,
    totalInvoiced: stats.totalInvoiced.toString(),
    lastInvoiceIssuedAt: stats.lastInvoiceIssuedAt?.toISOString() ?? null,
  };
}
