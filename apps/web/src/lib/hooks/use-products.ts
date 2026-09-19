'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProductRequest,
  Paginated,
  Product,
  UpdateProductRequest,
} from '@dashgobo/contracts';
import { useApiFetch } from '../use-api-fetch';
import { useOrg } from '../org-context';
import { buildQueryString } from '../query-string';

export interface ProductListParams {
  [key: string]: string | number | boolean | undefined;
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: 'name' | 'unitPrice' | 'createdAt' | 'updatedAt';
  order?: 'asc' | 'desc';
  type?: 'GOOD' | 'SERVICE';
  active?: boolean;
}

export function useProducts(params: ProductListParams) {
  const apiFetch = useApiFetch();
  const { organizationId } = useOrg();

  return useQuery({
    queryKey: ['products', 'list', organizationId, params],
    queryFn: () => apiFetch<Paginated<Product>>(`/products${buildQueryString(params)}`),
    enabled: Boolean(organizationId),
    placeholderData: (previous) => previous,
  });
}

export function useProduct(id: string | undefined) {
  const apiFetch = useApiFetch();
  const { organizationId } = useOrg();

  return useQuery({
    queryKey: ['products', 'detail', organizationId, id],
    queryFn: () => apiFetch<Product>(`/products/${id}`),
    enabled: Boolean(organizationId) && Boolean(id),
  });
}

export function useCreateProduct() {
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  const { organizationId } = useOrg();

  return useMutation({
    mutationFn: (body: CreateProductRequest) =>
      apiFetch<Product>('/products', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', 'list', organizationId] });
    },
  });
}

export function useUpdateProduct(id: string) {
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  const { organizationId } = useOrg();

  return useMutation({
    mutationFn: (body: UpdateProductRequest) =>
      apiFetch<Product>(`/products/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', 'list', organizationId] });
      void queryClient.invalidateQueries({ queryKey: ['products', 'detail', organizationId, id] });
    },
  });
}

export function useDeleteProduct() {
  const apiFetch = useApiFetch();
  const queryClient = useQueryClient();
  const { organizationId } = useOrg();

  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', 'list', organizationId] });
    },
  });
}
