import { Injectable } from '@nestjs/common';
import type {
  DashboardActivity,
  DashboardRecentInvoice,
  DashboardSummary,
} from '@dashgobo/contracts';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { buildDailyRevenueSeries } from './revenue-series';

const REVENUE_WINDOW_DAYS = 30;
const RECENT_INVOICES_LIMIT = 5;
const RECENT_ACTIVITY_LIMIT = 10;
const AUTHORIZED_STATUSES = ['AUTHORIZED', 'PAID'] as const;
const OPEN_STATUSES = ['DRAFT', 'PENDING', 'ERROR'] as const;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(organizationId: string): Promise<DashboardSummary> {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const seriesStart = new Date(now.getTime() - (REVENUE_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000);

    const [
      organization,
      billedAggregate,
      pendingInvoices,
      paymentsAggregate,
      activeCustomers,
      revenueRows,
      recentInvoiceRows,
      recentActivityRows,
    ] = await this.prisma.$transaction([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { defaultCurrency: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          organizationId,
          status: { in: [...AUTHORIZED_STATUSES] },
          issuedAt: { gte: startOfMonth },
        },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.invoice.count({
        where: { organizationId, status: { in: [...OPEN_STATUSES] } },
      }),
      this.prisma.payment.aggregate({
        where: { organizationId, status: 'CONFIRMED', paidAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      this.prisma.customer.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          status: { in: [...AUTHORIZED_STATUSES] },
          issuedAt: { gte: seriesStart },
        },
        select: { issuedAt: true, total: true },
      }),
      this.prisma.invoice.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: RECENT_INVOICES_LIMIT,
        include: { customer: { select: { name: true } } },
      }),
      this.prisma.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: RECENT_ACTIVITY_LIMIT,
      }),
    ]);

    const recentInvoices: DashboardRecentInvoice[] = recentInvoiceRows.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      status: row.status,
      total: row.total.toString(),
      currency: row.currency,
      customerName: row.customer.name,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));

    const recentActivity: DashboardActivity[] = recentActivityRows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      createdAt: row.createdAt.toISOString(),
    }));

    return {
      currency: organization?.defaultCurrency ?? 'ARS',
      billedThisMonth: (billedAggregate._sum.total ?? 0n).toString(),
      invoiceCountThisMonth: billedAggregate._count,
      pendingInvoices,
      paymentsReceivedThisMonth: (paymentsAggregate._sum.amount ?? 0n).toString(),
      activeCustomers,
      revenueSeries: buildDailyRevenueSeries(revenueRows, REVENUE_WINDOW_DAYS, now),
      recentInvoices,
      recentActivity,
    };
  }
}
