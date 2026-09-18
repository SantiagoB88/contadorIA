import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination';

export const invoiceStatusSchema = z.enum([
  'DRAFT',
  'PENDING',
  'AUTHORIZED',
  'PAID',
  'CANCELLED',
  'ERROR',
]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const invoiceTypeSchema = z.enum(['A', 'B', 'C', 'E']);
export type InvoiceType = z.infer<typeof invoiceTypeSchema>;

/**
 * One requested line. Either references a catalog product (`productId`) —
 * price/tax rate default to the product's — or is ad-hoc (no `productId`,
 * `description` + `unitPrice` + `taxRate` required). Supplying `unitPrice` or
 * `taxRate` that differs from the product's catalog value requires the
 * `invoice:override_price` permission; the server always re-derives and
 * re-sums every amount, never trusts these as final (§44).
 */
export const invoiceItemInputSchema = z
  .object({
    productId: z.string().uuid().optional(),
    description: z.string().trim().min(1).max(500).optional(),
    quantity: z.coerce.number().positive().max(1_000_000),
    unitPrice: z.coerce.number().int().nonnegative().optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.productId && !val.description) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['description'],
        message: 'description is required for an item with no productId',
      });
    }
    if (!val.productId && val.unitPrice === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unitPrice'],
        message: 'unitPrice is required for an item with no productId',
      });
    }
    if (!val.productId && val.taxRate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['taxRate'],
        message: 'taxRate is required for an item with no productId',
      });
    }
  });
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;

export const createInvoiceRequestSchema = z.object({
  customerId: z.string().uuid(),
  invoiceType: invoiceTypeSchema.default('B'),
  pointOfSale: z.coerce.number().int().positive().default(1),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(invoiceItemInputSchema).min(1).max(100),
});
export type CreateInvoiceRequest = z.infer<typeof createInvoiceRequestSchema>;

export const invoiceItemSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  productId: z.string().uuid().nullable(),
  description: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
  taxRate: z.number(),
  subtotal: z.string(),
  total: z.string(),
});
export type InvoiceItemDto = z.infer<typeof invoiceItemSchema>;

export const invoiceSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  customerId: z.string().uuid(),
  status: invoiceStatusSchema,
  invoiceType: invoiceTypeSchema,
  pointOfSale: z.number().int(),
  invoiceNumber: z.number().int().nullable(),
  currency: z.string(),
  subtotal: z.string(),
  taxes: z.string(),
  total: z.string(),
  cae: z.string().nullable(),
  caeExpiration: z.string().nullable(),
  externalId: z.string().nullable(),
  notes: z.string().nullable(),
  issuedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const invoiceDetailSchema = invoiceSchema.extend({
  items: z.array(invoiceItemSchema),
});
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>;

export const INVOICE_SORT_FIELDS = ['createdAt', 'issuedAt', 'total'] as const;
export type InvoiceSortField = (typeof INVOICE_SORT_FIELDS)[number];

export const invoiceListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(INVOICE_SORT_FIELDS).default('createdAt'),
  status: invoiceStatusSchema.optional(),
  customerId: z.string().uuid().optional(),
  invoiceType: invoiceTypeSchema.optional(),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
