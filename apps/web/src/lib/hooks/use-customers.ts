'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateCustomerRequest,
  Customer,
  CustomerDetail,
  Paginated,
  UpdateCustomerRequest,
} from '@dashgobo/contracts';
import { useApiFetch } from '../use-api-fetch';
import { useOrg } from '../org-context';
import { buildQueryString } from '../query-string';

export interface CustomerListParams {
  [key: string]: string | number | boolean | undefined;
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: 'name' | 'createdAt' | 'updatedAt';
  order?: 'asc' | 'desc';
}

export function useCustomers(params: CustomerListParams) {
  const apiFetch = useApiFetch();
  const { organizationId } = useOrg();

  return useQuery({
    queryKey: ['customers', 'list', organizationId, params],
    queryFn: () => apiFetch<Paginated<Customer>>(`/customers${buildQueryString(params)}`),
    enabled: Boolean(organizationId),
    placeholderData: (previous) => previous,
  });
}

export function useCustomer(id: string | undefined) {
  const apiFetch = useApiFetch();
  const { organizationId } = useOrg();

  return useQuery({
    queryKey: ['customers', 'detail', organizationId, id],
    queryFn: () => apiFetch<CustomerDetail>(`/customers/${id}`),
    enabled: Boolean(organizationId) && Boolean(id),
  });
}

export function useCreateCustomer() {
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  const { organizationId } = useOrg();

  return useMutation({
    mutationFn: (body: CreateCustomerRequest) =>
      apiFetch<Customer>('/customers', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers', 'list', organizationId] });
    },
  });
}

export function useUpdateCustomer(id: string) {
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  const { organizationId } = useOrg();

  return useMutation({
    mutationFn: (body: UpdateCustomerRequest) =>
      apiFetch<Customer>(`/customers/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers', 'list', organizationId] });
      void queryClient.invalidateQueries({ queryKey: ['customers', 'detail', organizationId, id] });
    },
  });
}

export function useDeleteCustomer() {
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  const { organizationId } = useOrg();

  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/customers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers', 'list', organizationId] });
    },
  });
}
