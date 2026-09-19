'use client';

import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'bg-[var(--color-surface)] text-[var(--color-fg)] border border-[var(--color-border)] shadow-lg',
          description: 'text-[var(--color-muted)]',
        },
      }}
    />
  );
}
