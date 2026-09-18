/**
 * Pure money math for an invoice. No I/O, no Prisma — resolving which price
 * each item actually uses (catalog vs. override) happens in
 * `InvoicesService`; this only sums what it's given. Called both when a
 * DRAFT is created and, defensively, is exercised by tests directly so the
 * rounding rule is pinned down independently of the service.
 *
 * Money in, money out is `bigint` (minor units). The per-item multiplication
 * by a fractional `quantity` is done in `number` space (safe for any
 * realistic invoice amount, well under `Number.MAX_SAFE_INTEGER`) and rounded
 * to the nearest minor unit — the same rounding a human cashier would apply.
 */
export interface ResolvedInvoiceItem {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: bigint;
  taxRate: number;
}

export interface ComputedInvoiceItem extends ResolvedInvoiceItem {
  subtotal: bigint;
  taxAmount: bigint;
  total: bigint;
}

export interface ComputedInvoice {
  items: ComputedInvoiceItem[];
  subtotal: bigint;
  taxes: bigint;
  total: bigint;
}

export function computeInvoiceTotals(items: ResolvedInvoiceItem[]): ComputedInvoice {
  const computedItems = items.map(computeItem);

  return {
    items: computedItems,
    subtotal: sumBy(computedItems, (i) => i.subtotal),
    taxes: sumBy(computedItems, (i) => i.taxAmount),
    total: sumBy(computedItems, (i) => i.total),
  };
}

function computeItem(item: ResolvedInvoiceItem): ComputedInvoiceItem {
  const subtotal = roundToBigInt(Number(item.unitPrice) * item.quantity);
  const taxAmount = roundToBigInt(Number(subtotal) * (item.taxRate / 100));
  return { ...item, subtotal, taxAmount, total: subtotal + taxAmount };
}

function sumBy<T>(items: T[], pick: (item: T) => bigint): bigint {
  return items.reduce((sum, item) => sum + pick(item), 0n);
}

function roundToBigInt(value: number): bigint {
  return BigInt(Math.round(value));
}
