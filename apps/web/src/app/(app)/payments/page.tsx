'use client';

import { CreditCard } from 'lucide-react';
import { usePayments } from '@/lib/hooks/use-payments';
import type { Payment, PortalStatus } from '@/lib/portal/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { PaymentRow } from '@/components/portal/payment-row';

const GROUPS: { status: PortalStatus; title: string }[] = [
  { status: 'PENDING', title: 'Pendientes de pago' },
  { status: 'IN_PROCESS', title: 'En proceso' },
  { status: 'PAID', title: 'Realizados' },
  { status: 'OVERDUE', title: 'Vencidos' },
];

export default function PaymentsPage() {
  const { data: payments, isLoading } = usePayments();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pagos</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Estado de tus pagos de obligaciones y acceso a los comprobantes.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        GROUPS.map((group) => (
          <PaymentGroup key={group.status} title={group.title} payments={payments ?? []} status={group.status} />
        ))
      )}
    </div>
  );
}

function PaymentGroup({
  title,
  payments,
  status,
}: {
  title: string;
  payments: Payment[];
  status: PortalStatus;
}) {
  const items = payments.filter((p) => p.status === status);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} <span className="text-sm font-normal text-[var(--color-muted)]">({items.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <EmptyState icon={CreditCard} title="No hay pagos en este estado" />
        ) : (
          items.map((p) => <PaymentRow key={p.id} payment={p} />)
        )}
      </CardContent>
    </Card>
  );
}
