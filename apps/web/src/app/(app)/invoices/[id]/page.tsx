'use client';

import Link from 'next/link';
import { use } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuthorizeInvoice, useInvoice } from '@/lib/hooks/use-invoices';
import { useOrg } from '@/lib/org-context';
import { formatMoney } from '@/lib/money';
import { INVOICE_TYPE_LABELS } from '@/lib/labels';
import { ApiRequestError } from '@/lib/api';
import { roleHasPermission } from '@dashgobo/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InvoiceStatusBadge } from '@/components/invoice-status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: invoice, isLoading } = useInvoice(id);
  const { membership } = useOrg();
  const authorize = useAuthorizeInvoice();
  const canAuthorize = membership ? roleHasPermission(membership.role, 'invoice:authorize') : false;

  async function handleAuthorize() {
    try {
      await authorize.mutateAsync(id);
      toast.success('Factura autorizada');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'No se pudo autorizar la factura');
    }
  }

  if (isLoading || !invoice) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const canRetry = invoice.status === 'DRAFT' || invoice.status === 'ERROR';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {invoice.invoiceNumber
                ? `${INVOICE_TYPE_LABELS[invoice.invoiceType]} ${String(invoice.pointOfSale).padStart(4, '0')}-${String(invoice.invoiceNumber).padStart(8, '0')}`
                : `${INVOICE_TYPE_LABELS[invoice.invoiceType]} (borrador)`}
            </h1>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <Link href={`/customers/${invoice.customerId}`} className="text-sm text-[var(--color-accent)] hover:underline">
            {invoice.customerName}
          </Link>
        </div>

        {canRetry && canAuthorize && (
          <ConfirmDialog
            trigger={<Button disabled={authorize.isPending}>{authorize.isPending ? 'Autorizando…' : 'Autorizar'}</Button>}
            title="¿Autorizar esta factura?"
            description="Se le asigna número y CAE y ya no se puede volver a borrador. Esta acción es la que corresponde a emitir el comprobante."
            confirmLabel="Autorizar"
            destructive={false}
            onConfirm={() => void handleAuthorize()}
          />
        )}
      </div>

      {invoice.status === 'ERROR' && (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-4 text-sm text-[var(--color-danger)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Hubo un error al autorizar esta factura. Podés reintentar — no se va a duplicar ni a
            perder el número si ya se había llegado a asignar.
          </p>
        </div>
      )}

      {invoice.status === 'AUTHORIZED' && invoice.cae && (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--color-success)] bg-[var(--color-success-bg)] p-4 text-sm text-[var(--color-success)]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>
              CAE <span className="font-mono">{invoice.cae}</span>
            </p>
            {invoice.caeExpiration && (
              <p>Vence el {new Date(invoice.caeExpiration).toLocaleDateString('es-AR')}</p>
            )}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ítems</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Precio unit.</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(item.unitPrice, invoice.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{item.taxRate}%</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(item.total, invoice.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1 pt-6 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--color-muted)]">Subtotal</span>
            <span className="tabular-nums">{formatMoney(invoice.subtotal, invoice.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-muted)]">Impuestos</span>
            <span className="tabular-nums">{formatMoney(invoice.taxes, invoice.currency)}</span>
          </div>
          <div className="flex justify-between border-t border-[var(--color-border)] pt-1 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(invoice.total, invoice.currency)}</span>
          </div>
        </CardContent>
      </Card>

      {invoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--color-muted)]">{invoice.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}
