'use client';

import type { ReactNode } from 'react';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/portal/format';
import type { Obligation } from '@/lib/portal/types';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Payment instructions only — no charge is ever made here. The UI is shaped
 * so wiring a real payment provider later only means replacing the content
 * of this dialog with a checkout flow.
 */
export function PayDialog({ obligation, children }: { obligation: Obligation; children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Pagar {obligation.concept} · {obligation.period}
          </DialogTitle>
          <DialogDescription>Vence el {formatDate(obligation.dueDate)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <p className="text-sm text-[var(--color-muted)]">Importe a pagar</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatMoney(obligation.amount, obligation.currency)}
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <p className="font-medium">Datos para transferencia</p>
            <div className="flex justify-between text-[var(--color-muted)]">
              <span>CBU</span>
              <span className="font-mono text-[var(--color-fg)]">0000003100012345678901</span>
            </div>
            <div className="flex justify-between text-[var(--color-muted)]">
              <span>Alias</span>
              <span className="font-mono text-[var(--color-fg)]">ESTUDIO.DEMO.CONTABLE</span>
            </div>
          </div>

          <p className="text-xs text-[var(--color-muted)]">
            Próximamente vas a poder pagar directamente desde acá. Por ahora, hacé la transferencia y
            subí el comprobante desde Documentos.
          </p>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
