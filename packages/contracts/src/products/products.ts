import { z } from 'zod';
import { optionalText } from '../common/zod-helpers';
import { paginationQuerySchema } from '../common/pagination';

export const productTypeSchema = z.enum(['GOOD', 'SERVICE']);
export type ProductType = z.infer<typeof productTypeSchema>;

/**
 * `unitPrice` is always the integer minor unit of `currency` (centavos for
 * ARS) — same convention as money everywhere else in the API (see ADR-002).
 * It travels as a string end to end so it is never silently rounded through
 * JSON's float `number`; a future UI form converts pesos <-> centavos at the
 * edge, not this contract.
 */
export const productSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  sku: z.string().nullable(),
  type: productTypeSchema,
  unitPrice: z.string(),
  currency: z.string(),
  taxRate: z.number(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Product = z.infer<typeof productSchema>;

export const createProductRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: optionalText(z.string().trim().max(2000)),
  sku: optionalText(z.string().trim().min(1).max(60)),
  type: productTypeSchema.default('SERVICE'),
  unitPrice: z.coerce.number().int().nonnegative(),
  currency: z.string().trim().length(3).toUpperCase().default('ARS'),
  taxRate: z.coerce.number().min(0).max(100).default(21),
});
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

export const updateProductRequestSchema = createProductRequestSchema.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;

export const PRODUCT_SORT_FIELDS = ['name', 'unitPrice', 'createdAt', 'updatedAt'] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

export const productListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(PRODUCT_SORT_FIELDS).default('createdAt'),
  type: productTypeSchema.optional(),
  active: z.coerce.boolean().optional(),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
