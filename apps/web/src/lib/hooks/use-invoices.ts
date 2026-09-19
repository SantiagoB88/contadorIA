'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateInvoiceRequest,
  Invoice,
  InvoiceDetail,
  InvoiceStatus,
  InvoiceType,
  Paginated,
} from '@dashgobo/contracts';
import { useApiFetch } from '../use-api-fetch';
import { useOrg } from '../org-context';
import { buildQueryString } from '../query-string';

export interface InvoiceListParams {
  [key: string]: string | number | boolean | undefined;
  page?: number;
  pageSize?: number;
  sort?: 'createdAt' | 'issuedAt' | 'total';
  order?: 'asc' | 'desc';
  status?: InvoiceStatus;
  customerId?: string;
  invoiceType?: InvoiceType;
}

export function useInvoices(params: InvoiceListParams) {
  const apiFetch = useApiFetch();
  const { organizationId } = useOrg();

  return useQuery({
    queryKey: ['invoices', 'list', organizationId, params],
    queryFn: () => apiFetch<Paginated<Invoice>>(`/invoices${buildQueryString(params)}`),
    enabled: Boolean(organizationId),
    placeholderData: (previous) => previous,
  });
}

export function useInvoice(id: string | undefined) {
  const apiFetch = useApiFetch();
  const { organizationId } = useOrg();

  return useQuery({
    queryKey: ['invoices', 'detail', organizationId, id],
    queryFn: () => apiFetch<InvoiceDetail>(`/invoices/${id}`),
    enabled: Boolean(organizationId) && Boolean(id),
  });
}

/** A random key per mutation "session" so a form re-submit after a network
 * error reuses the same Idempotency-Key instead of risking a duplicate. */
function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `idk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useCreateInvoice() {
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  const { organizationId } = useOrg();

  return useMutation({
    mutationFn: (body: CreateInvoiceRequest) =>
      apiFetch<InvoiceDetail>('/invoices', {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices', 'list', organizationId] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', organizationId] });
    },
  });
}

export function useAuthorizeInvoice() {
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  const { organizationId } = useOrg();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<InvoiceDetail>(`/invoices/${id}/authorize`, {
        method: 'POST',
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      }),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ['invoices', 'list', organizationId] });
      void queryClient.invalidateQueries({ queryKey: ['invoices', 'detail', organizationId, id] });
      void queryClient.invalidateQueries({ queryKey: ['customers', organizationId] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', organizationId] });
    },
  });
}
