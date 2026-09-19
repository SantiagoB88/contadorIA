'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MoreHorizontal, Package, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useDeleteProduct, useProducts } from '@/lib/hooks/use-products';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { formatMoney } from '@/lib/money';
import { ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/confirm-dialog';

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);
  const { data, isLoading, isPlaceholderData } = useProducts({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
  });
  const deleteProduct = useDeleteProduct();

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  async function handleDeactivate(id: string, name: string) {
    try {
      await deleteProduct.mutateAsync(id);
      toast.success(`${name} eliminado`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'No se pudo eliminar');
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos y servicios</h1>
          <p className="text-sm text-[var(--color-muted)]">Tu catálogo para facturar más rápido.</p>
        </div>
        <Button asChild>
          <Link href="/products/new">
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Link>
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-muted)]" />
        <Input
          placeholder="Buscar por nombre, SKU…"
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
            icon={Package}
            title={search ? 'No encontramos productos con esa búsqueda' : 'Todavía no tenés productos'}
            description={!search ? 'Creá el primero para agregarlo a tus facturas.' : undefined}
            action={
              !search && (
                <Button asChild size="sm">
                  <Link href="/products/new">Crear producto</Link>
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
                  <TableHead>SKU</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Link href={`/products/${product.id}/edit`} className="font-medium hover:underline">
                        {product.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[var(--color-muted)]">{product.sku ?? '—'}</TableCell>
                    <TableCell className="text-[var(--color-muted)]">
                      {product.type === 'SERVICE' ? 'Servicio' : 'Bien'}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatMoney(product.unitPrice, product.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.active ? 'success' : 'outline'}>
                        {product.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Acciones">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/products/${product.id}/edit`}>Editar</Link>
                          </DropdownMenuItem>
                          <ConfirmDialog
                            trigger={
                              <DropdownMenuItem destructive onSelect={(e) => e.preventDefault()}>
                                Eliminar
                              </DropdownMenuItem>
                            }
                            title={`¿Eliminar ${product.name}?`}
                            description="No se borra el historial de facturas que ya lo usaron — solo deja de estar disponible para nuevas facturas."
                            confirmLabel="Eliminar"
                            onConfirm={() => void handleDeactivate(product.id, product.name)}
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
