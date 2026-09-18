import { z } from 'zod';
import { invoiceStatusSchema } from '../invoices/invoices';

export const revenuePointSchema = z.object({
  /** ISO date (YYYY-MM-DD), UTC day bucket. */
  date: z.string(),
  amount: z.string(),
});
export type RevenuePoint = z.infer<typeof revenuePointSchema>;

export const dashboardRecentInvoiceSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.number().int().nullable(),
  status: invoiceStatusSchema,
  total: z.string(),
  currency: z.string(),
  customerName: z.string(),
  issuedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type DashboardRecentInvoice = z.infer<typeof dashboardRecentInvoiceSchema>;

export const dashboardActivitySchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type DashboardActivity = z.infer<typeof dashboardActivitySchema>;

/**
 * "This month" figures use UTC month boundaries — timestamps are stored and
 * aggregated in UTC everywhere (see schema.prisma header); converting to the
 * organization's timezone for *display* is the presentation layer's job, not
 * this endpoint's (§41).
 */
export const dashboardSummarySchema = z.object({
  currency: z.string(),
  billedThisMonth: z.string(),
  invoiceCountThisMonth: z.number().int().nonnegative(),
  pendingInvoices: z.number().int().nonnegative(),
  paymentsReceivedThisMonth: z.string(),
  activeCustomers: z.number().int().nonnegative(),
  revenueSeries: z.array(revenuePointSchema),
  recentInvoices: z.array(dashboardRecentInvoiceSchema),
  recentActivity: z.array(dashboardActivitySchema),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
