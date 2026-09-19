'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

export interface PickerOption {
  id: string;
  label: string;
  sublabel?: string;
}

/** A search-as-you-type picker for customers/products — no combobox library, just a debounced list. */
export function EntityPicker({
  value,
  options,
  isLoading,
  search,
  onSearchChange,
  onSelect,
  placeholder,
  emptyLabel,
}: {
  value: PickerOption | null;
  options: PickerOption[];
  isLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (option: PickerOption) => void;
  placeholder: string;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-sm shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          <span className={cn(!value && 'text-[var(--color-muted)]')}>{value?.label ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] p-0">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-2 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar…"
            className="h-7 border-0 p-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {isLoading ? (
            <p className="px-2 py-3 text-sm text-[var(--color-muted)]">Buscando…</p>
          ) : options.length === 0 ? (
            <p className="px-2 py-3 text-sm text-[var(--color-muted)]">{emptyLabel}</p>
          ) : (
            options.map((option) => (
              <DropdownMenuItem
                key={option.id}
                onSelect={() => {
                  onSelect(option);
                  setOpen(false);
                }}
              >
                {value?.id === option.id && <Check className="h-3.5 w-3.5" />}
                <div className="min-w-0">
                  <p className="truncate">{option.label}</p>
                  {option.sublabel && (
                    <p className="truncate text-xs text-[var(--color-muted)]">{option.sublabel}</p>
                  )}
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
