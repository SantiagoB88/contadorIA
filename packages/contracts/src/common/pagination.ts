import { z } from 'zod';

/** Upper bound for `pageSize` to protect the API from unbounded result sets. */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z.string().min(1).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().min(1).max(200).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<TItem> {
  data: TItem[];
  meta: PaginationMeta;
}

export function buildPaginationMeta(
  page: number,
  pageSize: number,
  totalItems: number,
): PaginationMeta {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
}
