import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatTile({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between">
        <p className="text-sm text-[var(--color-muted)]">{label}</p>
        {icon && <span className="text-[var(--color-muted)]">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold" style={{ fontVariantNumeric: 'proportional-nums' }}>
        {value}
      </p>
    </Card>
  );
}
