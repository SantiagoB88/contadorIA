import { z } from 'zod';
import { optionalText } from '../common/zod-helpers';
import { orgRoleSchema } from '../common/roles';

export const taxConditionSchema = z.enum([
  'RESPONSABLE_INSCRIPTO',
  'MONOTRIBUTO',
  'EXENTO',
  'CONSUMIDOR_FINAL',
  'NO_CATEGORIZADO',
]);
export type TaxCondition = z.infer<typeof taxConditionSchema>;

/** CUIT: 11 digits, optionally formatted as 20-12345678-3. */
export const cuitSchema = z
  .string()
  .trim()
  .regex(/^\d{2}-?\d{8}-?\d$/, 'CUIT must be 11 digits');

export const organizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  legalName: z.string().nullable(),
  cuit: z.string().nullable(),
  taxCondition: taxConditionSchema,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  logoUrl: z.string().nullable(),
  timezone: z.string(),
  defaultCurrency: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Organization = z.infer<typeof organizationSchema>;

export const createOrganizationRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  legalName: optionalText(z.string().trim().max(160)),
  cuit: optionalText(cuitSchema),
  taxCondition: taxConditionSchema.optional(),
  email: optionalText(z.string().trim().toLowerCase().email().max(320)),
  phone: optionalText(z.string().trim().max(40)),
  address: optionalText(z.string().trim().max(240)),
  timezone: optionalText(z.string().trim().max(64)),
  defaultCurrency: optionalText(z.string().trim().length(3).toUpperCase()),
});
export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>;

export const updateOrganizationRequestSchema = createOrganizationRequestSchema.partial();
export type UpdateOrganizationRequest = z.infer<typeof updateOrganizationRequestSchema>;

export const organizationSummarySchema = organizationSchema
  .pick({ id: true, name: true, legalName: true, cuit: true, taxCondition: true })
  .extend({ role: orgRoleSchema });
export type OrganizationSummary = z.infer<typeof organizationSummarySchema>;
