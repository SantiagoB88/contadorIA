import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/portal/format';
import type { Obligation } from '@/lib/portal/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PortalStatusBadge } from './status-badge';
import { PayDialog } from './pay-dialog';

export function ObligationCard({ obligation }: { obligation: Obligation }) {
  const payable = obligation.status === 'PENDING' || obligation.status === 'DUE_SOON' || obligation.status === 'OVERDUE';

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{obligation.concept}</p>
          <p className="text-xs text-[var(--color-muted)]">{obligation.agency}</p>
        </div>
        <PortalStatusBadge status={obligation.status} />
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-[var(--color-muted)]">Período</dt>
        <dd className="text-right">{obligation.period}</dd>
        <dt className="text-[var(--color-muted)]">Vence</dt>
        <dd className="text-right">{formatDate(obligation.dueDate)}</dd>
      </dl>

      <p className="text-xl font-semibold tabular-nums">
        {formatMoney(obligation.amount, obligation.currency)}
      </p>

      {payable ? (
        <PayDialog obligation={obligation}>
          <Button size="sm" className="w-full">
            Pagar
          </Button>
        </PayDialog>
      ) : (
        <Button size="sm" variant="outline" className="w-full" asChild>
          <Link href="/obligations">Ver</Link>
        </Button>
      )}
    </Card>
  );
}
