'use client';

import Link from 'next/link';
import { FileText, Plus, Receipt, Users, Wallet } from 'lucide-react';
import { useDashboardSummary } from '@/lib/hooks/use-dashboard';
import { useOrg } from '@/lib/org-context';
import { formatMoney } from '@/lib/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { InvoiceStatusBadge } from '@/components/invoice-status-badge';
import { StatTile } from '@/components/dashboard/stat-tile';
import { RevenueChart } from '@/components/dashboard/revenue-chart';

export default function DashboardPage() {
  const { membership } = useOrg();
  const { data, isLoading } = useDashboardSummary();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-[var(--color-muted)]">{membership?.organizationName}</p>
        </div>
        <Button asChild>
          <Link href="/invoices/new">
            <Plus className="h-4 w-4" />
            Crear factura
          </Link>
        </Button>
      </div>

      {isLoading || !data ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Facturación del mes"
              value={formatMoney(data.billedThisMonth, data.currency)}
              icon={<Wallet className="h-4 w-4" />}
            />
            <StatTile
              label="Comprobantes del mes"
              value={String(data.invoiceCountThisMonth)}
              icon={<Receipt className="h-4 w-4" />}
            />
            <StatTile
              label="Facturas pendientes"
              value={String(data.pendingInvoices)}
              icon={<FileText className="h-4 w-4" />}
            />
            <StatTile
              label="Clientes activos"
              value={String(data.activeCustomers)}
              icon={<Users className="h-4 w-4" />}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Facturación · últimos 30 días</CardTitle>
            </CardHeader>
            <CardContent>
              <RevenueChart points={data.revenueSeries} currency={data.currency} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Últimos comprobantes</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.recentInvoices.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="Todavía no creaste ninguna factura"
                    action={
                      <Button asChild size="sm">
                        <Link href="/invoices/new">Crear la primera</Link>
                      </Button>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-[var(--color-border)]">
                    {data.recentInvoices.map((invoice) => (
                      <li key={invoice.id}>
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="flex items-center justify-between px-6 py-3 text-sm hover:bg-[var(--color-surface-hover)]"
                        >
                          <div>
                            <p className="font-medium">{invoice.customerName}</p>
                            <p className="text-xs text-[var(--color-muted)]">
                              {invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : 'Sin número'}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="tabular-nums">
                              {formatMoney(invoice.total, invoice.currency)}
                            </span>
                            <InvoiceStatusBadge status={invoice.status} />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actividad reciente</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.recentActivity.length === 0 ? (
                  <EmptyState title="Todavía no hay actividad registrada" />
                ) : (
                  <ul className="divide-y divide-[var(--color-border)]">
                    {data.recentActivity.map((event) => (
                      <li key={event.id} className="px-6 py-3 text-sm">
                        <p>{describeActivity(event.action)}</p>
                        <p className="text-xs text-[var(--color-muted)]">
                          {new Date(event.createdAt).toLocaleString('es-AR')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-48" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

const ACTIVITY_LABELS: Record<string, string> = {
  REGISTER: 'Se registró la cuenta',
  LOGIN: 'Inicio de sesión',
  CREATE_ORGANIZATION: 'Se creó la organización',
  UPDATE_ORGANIZATION: 'Se actualizaron los datos de la organización',
  CREATE_CUSTOMER: 'Se creó un cliente',
  UPDATE_CUSTOMER: 'Se actualizó un cliente',
  DELETE_CUSTOMER: 'Se desactivó un cliente',
  CREATE_PRODUCT: 'Se creó un producto',
  UPDATE_PRODUCT: 'Se actualizó un producto',
  DELETE_PRODUCT: 'Se desactivó un producto',
  CREATE_INVOICE: 'Se creó una factura',
  AUTHORIZE_INVOICE: 'Se autorizó una factura',
};

function describeActivity(action: string): string {
  return ACTIVITY_LABELS[action] ?? action;
}
