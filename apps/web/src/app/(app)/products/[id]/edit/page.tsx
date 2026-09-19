'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useProduct, useUpdateProduct } from '@/lib/hooks/use-products';
import { ProductForm, type ProductFormValues } from '@/components/products/product-form';
import { ApiRequestError } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: product, isLoading } = useProduct(id);
  const updateProduct = useUpdateProduct(id);

  async function handleSubmit(values: ProductFormValues) {
    try {
      await updateProduct.mutateAsync(values);
      toast.success('Producto actualizado');
      router.push('/products');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'No se pudo actualizar el producto');
    }
  }

  if (isLoading || !product) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Editar producto</h1>
      <ProductForm
        defaultValues={product}
        onSubmit={handleSubmit}
        submitLabel="Guardar cambios"
        showActiveToggle
      />
    </div>
  );
}
