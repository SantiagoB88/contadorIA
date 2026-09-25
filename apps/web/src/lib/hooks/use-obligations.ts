'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchObligations, type ObligationFilters } from '../portal/mock-service';

export function useObligations(filters: ObligationFilters = {}) {
  return useQuery({
    queryKey: ['portal', 'obligations', filters],
    queryFn: () => fetchObligations(filters),
  });
}
