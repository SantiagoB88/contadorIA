import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {Icon && (
        <div className="rounded-full bg-[var(--color-surface-muted)] p-3">
          <Icon className="h-6 w-6 text-[var(--color-muted)]" aria-hidden />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-sm text-[var(--color-muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}
