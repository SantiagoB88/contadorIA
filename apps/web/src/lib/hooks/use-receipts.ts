'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchReceipts } from '../portal/mock-service';

export function useReceipts() {
  return useQuery({
    queryKey: ['portal', 'receipts'],
    queryFn: fetchReceipts,
  });
}
