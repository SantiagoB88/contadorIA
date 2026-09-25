import type { PortalStatus } from '@/lib/portal/types';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const STATUS_CONFIG: Record<PortalStatus, { label: string; variant: BadgeProps['variant'] }> = {
  PENDING: { label: 'Pendiente', variant: 'outline' },
  DUE_SOON: { label: 'Próximo a vencer', variant: 'warning' },
  OVERDUE: { label: 'Vencido', variant: 'danger' },
  PAID: { label: 'Pagado', variant: 'success' },
  IN_PROCESS: { label: 'En proceso', variant: 'info' },
  ACTION_REQUIRED: { label: 'Requiere acción', variant: 'danger' },
  ANSWERED: { label: 'Respondida', variant: 'success' },
  CLOSED: { label: 'Cerrada', variant: 'default' },
};

export function PortalStatusBadge({ status }: { status: PortalStatus }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
