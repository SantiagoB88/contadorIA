import type { InvoiceStatus } from '@dashgobo/contracts';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; variant: BadgeProps['variant'] }> = {
  DRAFT: { label: 'Borrador', variant: 'outline' },
  PENDING: { label: 'Procesando', variant: 'warning' },
  AUTHORIZED: { label: 'Autorizada', variant: 'success' },
  PAID: { label: 'Pagada', variant: 'success' },
  CANCELLED: { label: 'Cancelada', variant: 'default' },
  ERROR: { label: 'Error', variant: 'danger' },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
