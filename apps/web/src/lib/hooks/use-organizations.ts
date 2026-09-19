'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateOrganizationRequest, Organization, UpdateOrganizationRequest } from '@dashgobo/contracts';
import { useApiFetch } from '../use-api-fetch';
import { useOrg } from '../org-context';

export function useOrganization() {
  const apiFetch = useApiFetch();
  const { organizationId } = useOrg();

  return useQuery({
    queryKey: ['organizations', 'detail', organizationId],
    queryFn: () => apiFetch<Organization>(`/organizations/${organizationId}`),
    enabled: Boolean(organizationId),
  });
}

export function useUpdateOrganization() {
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  const { organizationId } = useOrg();

  return useMutation({
    mutationFn: (body: UpdateOrganizationRequest) =>
      apiFetch<Organization>(`/organizations/${organizationId}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['organizations', 'detail', organizationId] });
    },
  });
}

export function useCreateOrganization() {
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateOrganizationRequest) =>
      apiFetch<Organization>('/organizations', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}
