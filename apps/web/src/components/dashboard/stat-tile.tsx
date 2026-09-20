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
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--color-muted)]">{label}</p>
          <p
            className="mt-2 text-2xl font-semibold"
            style={{ fontVariantNumeric: 'proportional-nums' }}
          >
            {value}
          </p>
        </div>
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
            {icon}
          </span>
        )}
      </div>
    </Card>
  );
}
