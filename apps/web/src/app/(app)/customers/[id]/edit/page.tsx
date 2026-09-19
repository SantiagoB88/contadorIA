'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCustomer, useUpdateCustomer } from '@/lib/hooks/use-customers';
import { CustomerForm, type CustomerFormValues } from '@/components/customers/customer-form';
import { ApiRequestError } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

export default function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: customer, isLoading } = useCustomer(id);
  const updateCustomer = useUpdateCustomer(id);

  async function handleSubmit(values: CustomerFormValues) {
    try {
      await updateCustomer.mutateAsync(values);
      toast.success('Cliente actualizado');
      router.push(`/customers/${id}`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'No se pudo actualizar el cliente');
    }
  }

  if (isLoading || !customer) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Editar cliente</h1>
      <CustomerForm defaultValues={customer} onSubmit={handleSubmit} submitLabel="Guardar cambios" />
    </div>
  );
}
