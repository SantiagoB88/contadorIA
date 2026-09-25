'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchPayments } from '../portal/mock-service';

export function usePayments() {
  return useQuery({
    queryKey: ['portal', 'payments'],
    queryFn: fetchPayments,
  });
}
