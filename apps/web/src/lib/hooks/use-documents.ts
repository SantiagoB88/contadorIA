'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDocuments, uploadDocument, type DocumentFilters } from '../portal/mock-service';
import type { DocumentCategory } from '../portal/types';

export function useDocuments(filters: DocumentFilters = {}) {
  return useQuery({
    queryKey: ['portal', 'documents', filters],
    queryFn: () => fetchDocuments(filters),
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { name: string; category: DocumentCategory }) => uploadDocument(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portal', 'documents'] });
    },
  });
}
