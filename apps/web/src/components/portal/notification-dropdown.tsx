'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useAttentionItems } from '@/lib/hooks/use-attention-items';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

export function NotificationDropdown() {
  const { data: items } = useAttentionItems();
  const count = items?.length ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-danger)] text-[10px] font-medium text-white">
              {count}
            </span>
          )}
          <span className="sr-only">Notificaciones</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notificaciones</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {count === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-[var(--color-muted)]">
            No tenés notificaciones nuevas.
          </p>
        ) : (
          items?.map((item) => (
            <DropdownMenuItem key={item.id} asChild>
              <Link href="/dashboard" className="flex flex-col items-start gap-0.5 whitespace-normal">
                <span className="text-sm font-medium">{item.title}</span>
                <span className="text-xs text-[var(--color-muted)]">{item.description}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
