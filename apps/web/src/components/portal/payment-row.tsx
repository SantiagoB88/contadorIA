import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/portal/format';
import type { Payment } from '@/lib/portal/types';
import { Button } from '@/components/ui/button';
import { PortalStatusBadge } from './status-badge';

export function PaymentRow({ payment }: { payment: Payment }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-6 py-3 text-sm last:border-0">
      <div>
        <p className="font-medium">{payment.concept}</p>
        <p className="text-xs text-[var(--color-muted)]">
          {payment.period} · {formatDate(payment.date)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="tabular-nums">{formatMoney(payment.amount, payment.currency)}</span>
        <PortalStatusBadge status={payment.status} />
        {payment.receiptId && (
          <Button size="sm" variant="ghost" asChild>
            <Link href="/receipts">Ver comprobante</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
