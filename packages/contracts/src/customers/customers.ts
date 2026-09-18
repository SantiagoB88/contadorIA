import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination';
import { taxConditionSchema } from '../organizations/organizations';

export const documentTypeSchema = z.enum(['CUIT', 'CUIL', 'DNI', 'PASSPORT', 'OTHER']);
export type DocumentType = z.infer<typeof documentTypeSchema>;

const documentNumberSchema = z.string().trim().min(1).max(20);

/** Light structural check per document type; not a full check-digit validator. */
function validateDocumentNumber(
  documentType: DocumentType,
  documentNumber: string,
  ctx: z.RefinementCtx,
): void {
  const digitsOnly = documentNumber.replace(/[^0-9]/g, '');
  if ((documentType === 'CUIT' || documentType === 'CUIL') && digitsOnly.length !== 11) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['documentNumber'],
      message: `${documentType} must have 11 digits`,
    });
  }
  if (documentType === 'DNI' && (digitsOnly.length < 6 || digitsOnly.length > 9)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['documentNumber'],
      message: 'DNI must have 6 to 9 digits',
    });
  }
}

export const customerSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  legalName: z.string().nullable(),
  documentType: documentTypeSchema,
  documentNumber: z.string(),
  taxCondition: taxConditionSchema,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Customer = z.infer<typeof customerSchema>;

/** Detail view: adds invoicing stats computed from the customer's invoices. */
export const customerDetailSchema = customerSchema.extend({
  invoiceCount: z.number().int().nonnegative(),
  totalInvoiced: z.string(), // money as string (BigInt-safe); minor units of organization.defaultCurrency
  lastInvoiceIssuedAt: z.string().datetime().nullable(),
});
export type CustomerDetail = z.infer<typeof customerDetailSchema>;

export const createCustomerRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    legalName: z.string().trim().max(200).optional(),
    documentType: documentTypeSchema.default('CUIT'),
    documentNumber: documentNumberSchema,
    taxCondition: taxConditionSchema.default('CONSUMIDOR_FINAL'),
    email: z.string().trim().toLowerCase().email().max(320).optional(),
    phone: z.string().trim().max(40).optional(),
    address: z.string().trim().max(240).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine((val, ctx) => validateDocumentNumber(val.documentType, val.documentNumber, ctx));
export type CreateCustomerRequest = z.infer<typeof createCustomerRequestSchema>;

export const updateCustomerRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    legalName: z.string().trim().max(200).optional(),
    documentType: documentTypeSchema.optional(),
    documentNumber: documentNumberSchema.optional(),
    taxCondition: taxConditionSchema.optional(),
    email: z.string().trim().toLowerCase().email().max(320).optional(),
    phone: z.string().trim().max(40).optional(),
    address: z.string().trim().max(240).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.documentType && val.documentNumber) {
      validateDocumentNumber(val.documentType, val.documentNumber, ctx);
    }
  });
export type UpdateCustomerRequest = z.infer<typeof updateCustomerRequestSchema>;

export const CUSTOMER_SORT_FIELDS = ['name', 'createdAt', 'updatedAt'] as const;
export type CustomerSortField = (typeof CUSTOMER_SORT_FIELDS)[number];

export const customerListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(CUSTOMER_SORT_FIELDS).default('createdAt'),
  documentType: documentTypeSchema.optional(),
  taxCondition: taxConditionSchema.optional(),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
