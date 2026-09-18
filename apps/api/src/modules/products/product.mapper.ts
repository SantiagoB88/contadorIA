import type { Product as ProductRow } from '@prisma/client';
import type { Product } from '@dashgobo/contracts';

export function toProductDto(row: ProductRow): Product {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    sku: row.sku,
    type: row.type,
    unitPrice: row.unitPrice.toString(),
    currency: row.currency,
    taxRate: row.taxRate.toNumber(),
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
