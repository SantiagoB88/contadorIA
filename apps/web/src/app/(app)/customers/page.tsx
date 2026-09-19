'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MoreHorizontal, Plus, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomers, useDeleteCustomer } from '@/lib/hooks/use-customers';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ApiRequestError } from '@/lib/api';
import { TAX_CONDITION_LABELS } from '@/lib/labels';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);
  const { data, isLoading, isPlaceholderData } = useCustomers({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
  });
  const deleteCustomer = useDeleteCustomer();

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  async function handleDeactivate(id: string, name: string) {
    try {
      await deleteCustomer.mutateAsync(id);
      toast.success(`${name} desactivado`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'No se pudo desactivar');
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-[var(--color-muted)]">Gestioná los clientes de tu organización.</p>
        </div>
        <Button asChild>
          <Link href="/customers/new">
            <Plus className="h-4 w-4" />
            Nuevo cliente
          </Link>
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-muted)]" />
        <Input
          placeholder="Buscar por nombre, documento o email…"
          className="pl-8"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !data || data.data.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? 'No encontramos clientes con esa búsqueda' : 'Todavía no tenés clientes'}
            description={!search ? 'Creá el primero para empezar a facturar.' : undefined}
            action={
              !search && (
                <Button asChild size="sm">
                  <Link href="/customers/new">Crear cliente</Link>
                </Button>
              )
            }
          />
        ) : (
          <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Condición fiscal</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                        {customer.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[var(--color-muted)]">
                      {customer.documentType} {customer.documentNumber}
                    </TableCell>
                    <TableCell className="text-[var(--color-muted)]">
                      {TAX_CONDITION_LABELS[customer.taxCondition]}
                    </TableCell>
                    <TableCell className="text-[var(--color-muted)]">{customer.email ?? '—'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Acciones">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/customers/${customer.id}`}>Ver</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/customers/${customer.id}/edit`}>Editar</Link>
                          </DropdownMenuItem>
                          <ConfirmDialog
                            trigger={
                              <DropdownMenuItem destructive onSelect={(e) => e.preventDefault()}>
                                Desactivar
                              </DropdownMenuItem>
                            }
                            title={`¿Desactivar a ${customer.name}?`}
                            description="No se borra ningún dato ni comprobante — solo deja de aparecer en la lista y en los selectores de nueva factura."
                            confirmLabel="Desactivar"
                            onConfirm={() => void handleDeactivate(customer.id, customer.name)}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
