import Link from 'next/link';
import type { ReactNode } from 'react';

export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[var(--color-accent)] opacity-[0.12] blur-3xl"
      />

      <div className="relative w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent)] text-sm font-bold text-[var(--color-accent-fg)]">
            D
          </span>
          <span className="text-lg font-semibold tracking-tight">DashGoBo</span>
        </Link>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
          <div className="mb-6 space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="text-sm text-[var(--color-muted)]">{description}</p>}
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
