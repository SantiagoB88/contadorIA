'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCreateCustomer } from '@/lib/hooks/use-customers';
import { CustomerForm, type CustomerFormValues } from '@/components/customers/customer-form';
import { ApiRequestError } from '@/lib/api';

export default function NewCustomerPage() {
  const router = useRouter();
  const createCustomer = useCreateCustomer();

  async function handleSubmit(values: CustomerFormValues) {
    try {
      const customer = await createCustomer.mutateAsync(values);
      toast.success('Cliente creado');
      router.push(`/customers/${customer.id}`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'No se pudo crear el cliente');
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Nuevo cliente</h1>
      <CustomerForm onSubmit={handleSubmit} submitLabel="Crear cliente" />
    </div>
  );
}
