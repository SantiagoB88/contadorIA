import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/portal/format';
import type { Obligation } from '@/lib/portal/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PortalStatusBadge } from './status-badge';
import { PayDialog } from './pay-dialog';

const PAYABLE_STATUSES = new Set(['PENDING', 'DUE_SOON', 'OVERDUE']);

export function ObligationsTable({ obligations }: { obligations: Obligation[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Concepto</TableHead>
          <TableHead>Período</TableHead>
          <TableHead>Vencimiento</TableHead>
          <TableHead className="text-right">Importe</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {obligations.map((obligation) => (
          <TableRow key={obligation.id}>
            <TableCell>
              <p className="font-medium">{obligation.concept}</p>
              <p className="text-xs text-[var(--color-muted)]">{obligation.agency}</p>
            </TableCell>
            <TableCell className="text-[var(--color-muted)]">{obligation.period}</TableCell>
            <TableCell className="text-[var(--color-muted)]">{formatDate(obligation.dueDate)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(obligation.amount, obligation.currency)}
            </TableCell>
            <TableCell>
              <PortalStatusBadge status={obligation.status} />
            </TableCell>
            <TableCell className="text-right">
              <ObligationAction obligation={obligation} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ObligationAction({ obligation }: { obligation: Obligation }) {
  if (PAYABLE_STATUSES.has(obligation.status)) {
    return (
      <PayDialog obligation={obligation}>
        <Button size="sm">Pagar</Button>
      </PayDialog>
    );
  }

  if (obligation.status === 'PAID') {
    return (
      <Button size="sm" variant="outline" asChild>
        <Link href="/receipts">Ver comprobante</Link>
      </Button>
    );
  }

  return (
    <Button size="sm" variant="outline" asChild>
      <Link href="/obligations">Ver detalle</Link>
    </Button>
  );
}
