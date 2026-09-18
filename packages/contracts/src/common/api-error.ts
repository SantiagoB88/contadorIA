import { z } from 'zod';

/**
 * Canonical error codes returned by the API. Kept as a shared union so the
 * frontend and the future WhatsApp bot can branch on `error.code` reliably
 * instead of parsing human-readable messages.
 */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'TOKEN_EXPIRED',
  'FORBIDDEN',
  'ORGANIZATION_ACCESS_DENIED',
  'NOT_FOUND',
  'CUSTOMER_NOT_FOUND',
  'PRODUCT_NOT_FOUND',
  'INVOICE_NOT_FOUND',
  'CONFLICT',
  'EMAIL_ALREADY_REGISTERED',
  'INVOICE_ALREADY_AUTHORIZED',
  'INVALID_INVOICE_STATE',
  'IDEMPOTENCY_KEY_CONFLICT',
  'RATE_LIMITED',
  'INVOICE_PROVIDER_ERROR',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).default({}),
    requestId: z.string().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export function isApiError(value: unknown): value is ApiError {
  return apiErrorSchema.safeParse(value).success;
}
