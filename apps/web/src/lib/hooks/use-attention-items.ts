'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAttentionItems } from '../portal/mock-service';

export function useAttentionItems() {
  return useQuery({
    queryKey: ['portal', 'attention-items'],
    queryFn: fetchAttentionItems,
  });
}
