'use client';

import { useMemo, useState } from 'react';
import { Download, Eye, Receipt as ReceiptIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useReceipts } from '@/lib/hooks/use-receipts';
import { formatDate } from '@/lib/portal/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function ReceiptsPage() {
  const { data: receipts, isLoading } = useReceipts();
  const [period, setPeriod] = useState('ALL');

  const periods = useMemo(
    () => Array.from(new Set((receipts ?? []).map((r) => r.period))),
    [receipts],
  );
  const filtered = (receipts ?? []).filter((r) => period === 'ALL' || r.period === period);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Comprobantes</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Comprobantes de pago de tus obligaciones fiscales.
        </p>
      </div>

      <Select value={period} onValueChange={setPeriod}>
        <SelectTrigger className="max-w-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos los períodos</SelectItem>
          {periods.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={ReceiptIcon} title="No hay comprobantes para este filtro" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.concept}</TableCell>
                  <TableCell className="text-[var(--color-muted)]">{r.period}</TableCell>
                  <TableCell className="text-[var(--color-muted)]">{formatDate(r.date)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toast.info('Vista previa no disponible en esta demo')}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Visualizar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toast.info('Descarga no disponible en esta demo')}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Descargar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
