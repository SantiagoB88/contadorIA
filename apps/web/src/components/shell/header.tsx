'use client';

import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useOrg } from '@/lib/org-context';
import { useOrganization } from '@/lib/hooks/use-organizations';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { NotificationDropdown } from '@/components/portal/notification-dropdown';
import { MobileSidebar } from './mobile-sidebar';

export function Header() {
  const { user, logout } = useAuth();
  const { membership, memberships, setOrganizationId } = useOrg();
  const { data: organization } = useOrganization();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
      <div className="flex items-center gap-2">
        <MobileSidebar />
        <div className="flex flex-col">
          {memberships.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-auto gap-1.5 py-1">
                  {membership?.organizationName ?? 'Organización'}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Tus organizaciones</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {memberships.map((m) => (
                  <DropdownMenuItem key={m.organizationId} onSelect={() => setOrganizationId(m.organizationId)}>
                    {m.organizationName}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="text-sm font-medium">{membership?.organizationName}</span>
          )}
          {organization?.cuit && (
            <span className="px-2 text-xs text-[var(--color-muted)]">CUIT {organization.cuit}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <NotificationDropdown />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-surface-muted)]">
                <UserIcon className="h-3.5 w-3.5" />
              </span>
              <span className="hidden sm:inline">{user?.firstName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {user?.firstName} {user?.lastName}
              <p className="mt-0.5 truncate text-xs font-normal text-[var(--color-muted)]">
                {user?.email}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => void handleLogout()}>
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
