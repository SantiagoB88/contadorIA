'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCreateProduct } from '@/lib/hooks/use-products';
import { ProductForm, type ProductFormValues } from '@/components/products/product-form';
import { ApiRequestError } from '@/lib/api';

export default function NewProductPage() {
  const router = useRouter();
  const createProduct = useCreateProduct();

  async function handleSubmit(values: ProductFormValues) {
    try {
      await createProduct.mutateAsync(values);
      toast.success('Producto creado');
      router.push('/products');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'No se pudo crear el producto');
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Nuevo producto</h1>
      <ProductForm onSubmit={handleSubmit} submitLabel="Crear producto" />
    </div>
  );
}
