'use client';

import { useObligations } from './use-obligations';
import { usePayments } from './use-payments';
import { useAttentionItems } from './use-attention-items';
import { getMonthSummary } from '../portal/selectors';
import type { MonthSummary } from '../portal/types';

interface PortalSummaryResult {
  isLoading: boolean;
  summary: MonthSummary | null;
}

/** Combines the three portal queries the home dashboard needs into one summary. */
export function usePortalSummary(): PortalSummaryResult {
  const obligations = useObligations();
  const payments = usePayments();
  const attentionItems = useAttentionItems();

  const isLoading = obligations.isLoading || payments.isLoading || attentionItems.isLoading;
  const summary =
    obligations.data && payments.data && attentionItems.data
      ? getMonthSummary(obligations.data, payments.data, attentionItems.data)
      : null;

  return { isLoading, summary };
}
