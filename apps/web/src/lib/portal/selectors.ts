import type { AttentionItem, MonthSummary, Obligation, Payment } from './types';

const UNPAID_STATUSES = new Set(['PENDING', 'DUE_SOON', 'OVERDUE']);

export type ObligationTab = 'PENDING' | 'DUE_SOON' | 'PAID' | 'ALL';

export function filterObligationsByTab(obligations: Obligation[], tab: ObligationTab): Obligation[] {
  switch (tab) {
    case 'PENDING':
      return obligations.filter((o) => o.status !== 'PAID');
    case 'DUE_SOON':
      return obligations.filter((o) => o.status === 'DUE_SOON');
    case 'PAID':
      return obligations.filter((o) => o.status === 'PAID');
    case 'ALL':
      return obligations;
  }
}

export function getUpcomingObligations(obligations: Obligation[], limit?: number): Obligation[] {
  const upcoming = obligations
    .filter((o) => UNPAID_STATUSES.has(o.status))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  return limit ? upcoming.slice(0, limit) : upcoming;
}

export function getRecentPayments(payments: Payment[], limit = 5): Payment[] {
  return [...payments]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

function isThisMonth(dateIso: string, today: Date): boolean {
  const date = new Date(dateIso);
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
}

export function getMonthSummary(
  obligations: Obligation[],
  payments: Payment[],
  attentionItems: AttentionItem[],
  today = new Date(),
): MonthSummary {
  const unpaid = obligations.filter((o) => UNPAID_STATUSES.has(o.status));
  const totalDue = unpaid.reduce((sum, o) => sum + o.amount, 0);

  const paidThisMonth = payments.filter((p) => p.status === 'PAID' && isThisMonth(p.date, today));
  const paidAmount = paidThisMonth.reduce((sum, p) => sum + p.amount, 0);

  const [nextObligation] = getUpcomingObligations(obligations, 1);

  return {
    totalDue,
    totalDueCount: unpaid.length,
    nextObligation: nextObligation ?? null,
    paidThisMonth: paidAmount,
    paidThisMonthCount: paidThisMonth.length,
    attentionCount: attentionItems.length,
  };
}
