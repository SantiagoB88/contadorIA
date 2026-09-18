import type { InvoiceStatus } from '@prisma/client';

/**
 * Valid transitions only. An `AUTHORIZED` invoice can never go back to
 * `DRAFT` (§43) — it simply has no outgoing edges here except toward `PAID`,
 * which the payments module (Fase 6) will add.
 */
const TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['PENDING'],
  PENDING: ['AUTHORIZED', 'ERROR'],
  ERROR: ['PENDING'],
  AUTHORIZED: [],
  PAID: [],
  CANCELLED: [],
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: InvoiceStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
