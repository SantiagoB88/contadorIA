'use client';

import { useQuery } from '@tanstack/react-query';
import type { DashboardSummary } from '@dashgobo/contracts';
import { useApiFetch } from '../use-api-fetch';
import { useOrg } from '../org-context';

export function useDashboardSummary() {
  const apiFetch = useApiFetch();
  const { organizationId } = useOrg();

  return useQuery({
    queryKey: ['dashboard', organizationId, 'summary'],
    queryFn: () => apiFetch<DashboardSummary>('/dashboard/summary'),
    enabled: Boolean(organizationId),
    refetchInterval: 60_000,
  });
}
