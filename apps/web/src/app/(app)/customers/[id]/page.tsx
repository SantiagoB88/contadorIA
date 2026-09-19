'use client';

import Link from 'next/link';
import { use } from 'react';
import { Pencil } from 'lucide-react';
import { useCustomer } from '@/lib/hooks/use-customers';
import { formatMoney } from '@/lib/money';
import { DOCUMENT_TYPE_LABELS, TAX_CONDITION_LABELS } from '@/lib/labels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: customer, isLoading } = useCustomer(id);

  if (isLoading || !customer) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {DOCUMENT_TYPE_LABELS[customer.documentType]} {customer.documentNumber}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/customers/${id}/edit`}>
            <Pencil className="h-4 w-4" />
            Editar
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-[var(--color-muted)]">Total facturado</p>
          <p className="mt-1 text-xl font-semibold">{formatMoney(customer.totalInvoiced)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-[var(--color-muted)]">Comprobantes</p>
          <p className="mt-1 text-xl font-semibold">{customer.invoiceCount}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-[var(--color-muted)]">Última factura</p>
          <p className="mt-1 text-xl font-semibold">
            {customer.lastInvoiceIssuedAt
              ? new Date(customer.lastInvoiceIssuedAt).toLocaleDateString('es-AR')
              : '—'}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos fiscales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Razón social" value={customer.legalName} />
            <Row label="Documento" value={`${DOCUMENT_TYPE_LABELS[customer.documentType]} ${customer.documentNumber}`} />
            <Row label="Condición fiscal" value={TAX_CONDITION_LABELS[customer.taxCondition]} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Email" value={customer.email} />
            <Row label="Teléfono" value={customer.phone} />
            <Row label="Dirección" value={customer.address} />
          </CardContent>
        </Card>
      </div>

      {customer.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--color-muted)]">{customer.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className="text-right">{value || '—'}</span>
    </div>
  );
}
