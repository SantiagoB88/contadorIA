import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const TONE_CHIP_CLASSES = {
  default: 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]',
  success: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
  warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
  danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
} as const;

export function StatTile({
  label,
  value,
  secondary,
  icon,
  tone = 'default',
  className,
}: {
  label: string;
  value: string;
  secondary?: string;
  icon?: ReactNode;
  tone?: keyof typeof TONE_CHIP_CLASSES;
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
          {secondary && <p className="mt-1 text-xs text-[var(--color-muted)]">{secondary}</p>}
        </div>
        {icon && (
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              TONE_CHIP_CLASSES[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>
    </Card>
  );
}
