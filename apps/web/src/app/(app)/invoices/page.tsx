'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import type { InvoiceStatus } from '@dashgobo/contracts';
import { useInvoices } from '@/lib/hooks/use-invoices';
import { formatMoney } from '@/lib/money';
import { INVOICE_TYPE_LABELS } from '@/lib/labels';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InvoiceStatusBadge } from '@/components/invoice-status-badge';

const STATUS_FILTERS: { value: InvoiceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Todos los estados' },
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'PENDING', label: 'Procesando' },
  { value: 'AUTHORIZED', label: 'Autorizada' },
  { value: 'PAID', label: 'Pagada' },
  { value: 'ERROR', label: 'Error' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

export default function InvoicesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<InvoiceStatus | 'ALL'>('ALL');
  const { data, isLoading, isPlaceholderData } = useInvoices({
    page,
    pageSize: 20,
    status: status === 'ALL' ? undefined : status,
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comprobantes</h1>
          <p className="text-sm text-[var(--color-muted)]">Todas tus facturas emitidas y en curso.</p>
        </div>
        <Button asChild>
          <Link href="/invoices/new">
            <Plus className="h-4 w-4" />
            Crear factura
          </Link>
        </Button>
      </div>

      <Select
        value={status}
        onValueChange={(v) => {
          setStatus(v as InvoiceStatus | 'ALL');
          setPage(1);
        }}
      >
        <SelectTrigger className="max-w-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_FILTERS.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !data || data.data.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Todavía no hay facturas"
            description="Creá la primera para empezar a facturar."
            action={
              <Button asChild size="sm">
                <Link href="/invoices/new">Crear factura</Link>
              </Button>
            }
          />
        ) : (
          <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <Link href={`/invoices/${invoice.id}`} className="font-medium hover:underline">
                        {invoice.invoiceNumber
                          ? `${String(invoice.pointOfSale).padStart(4, '0')}-${String(invoice.invoiceNumber).padStart(8, '0')}`
                          : 'Borrador'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[var(--color-muted)]">
                      {INVOICE_TYPE_LABELS[invoice.invoiceType]}
                    </TableCell>
                    <TableCell>{invoice.customerName}</TableCell>
                    <TableCell className="text-[var(--color-muted)]">
                      {new Date(invoice.issuedAt ?? invoice.createdAt).toLocaleDateString('es-AR')}
                    </TableCell>
                    <TableCell>
                      <InvoiceStatusBadge status={invoice.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(invoice.total, invoice.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
