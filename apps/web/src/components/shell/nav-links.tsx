'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { BOTTOM_NAV_ITEMS, NAV_ITEMS, type NavItem } from './nav-items';

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  async function handleLogout() {
    onNavigate?.();
    await logout();
    router.push('/login');
  }

  return (
    <div className="flex flex-1 flex-col justify-between overflow-y-auto p-3">
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </nav>

      <nav className="flex flex-col gap-1 border-t border-[var(--color-border)] pt-3">
        {BOTTOM_NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-fg)] transition-colors hover:bg-[var(--color-surface-hover)]"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Cerrar sesión
        </button>
      </nav>
    </div>
  );
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  if (item.disabled) {
    return (
      <span
        className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-[var(--color-muted)] opacity-50"
        title="Próximamente"
      >
        <Icon className="h-4 w-4" aria-hidden />
        {item.label}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
          : 'text-[var(--color-fg)] hover:bg-[var(--color-surface-hover)]',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {item.label}
    </Link>
  );
}
