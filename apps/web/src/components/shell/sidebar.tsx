import Link from 'next/link';
import { NavLinks } from './nav-links';

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] md:flex">
      <Link href="/dashboard" className="flex items-center gap-2 px-4 py-4">
        <span className="text-lg font-semibold tracking-tight">DashGoBo</span>
      </Link>
      <NavLinks />
    </aside>
  );
}
