'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createConsultation, fetchConsultations, replyToConsultation } from '../portal/mock-service';

export function useConsultations() {
  return useQuery({
    queryKey: ['portal', 'consultations'],
    queryFn: fetchConsultations,
  });
}

export function useCreateConsultation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { subject: string; text: string }) => createConsultation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portal', 'consultations'] });
    },
  });
}

export function useReplyToConsultation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ consultationId, text }: { consultationId: string; text: string }) =>
      replyToConsultation(consultationId, text),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portal', 'consultations'] });
    },
  });
}
