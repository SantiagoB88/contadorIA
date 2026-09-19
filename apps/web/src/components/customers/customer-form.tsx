'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createCustomerRequestSchema,
  type CreateCustomerRequest,
  type Customer,
} from '@dashgobo/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DOCUMENT_TYPE_LABELS, TAX_CONDITION_LABELS } from '@/lib/labels';

export type CustomerFormValues = CreateCustomerRequest;

export function CustomerForm({
  defaultValues,
  onSubmit,
  submitLabel,
}: {
  defaultValues?: Partial<Customer>;
  onSubmit: (values: CustomerFormValues) => Promise<void>;
  submitLabel: string;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(createCustomerRequestSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      legalName: defaultValues?.legalName ?? undefined,
      documentType: defaultValues?.documentType ?? 'CUIT',
      documentNumber: defaultValues?.documentNumber ?? '',
      taxCondition: defaultValues?.taxCondition ?? 'CONSUMIDOR_FINAL',
      email: defaultValues?.email ?? undefined,
      phone: defaultValues?.phone ?? undefined,
      address: defaultValues?.address ?? undefined,
      notes: defaultValues?.notes ?? undefined,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-2xl space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">Nombre *</Label>
          <Input id="name" {...register('name')} />
          {errors.name && <p className="text-sm text-[var(--color-danger)]">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="legalName">Razón social</Label>
          <Input id="legalName" {...register('legalName')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="documentType">Tipo de documento</Label>
          <Select
            value={watch('documentType')}
            onValueChange={(v) => setValue('documentType', v as CustomerFormValues['documentType'])}
          >
            <SelectTrigger id="documentType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="documentNumber">Número de documento *</Label>
          <Input id="documentNumber" placeholder="20-12345678-3" {...register('documentNumber')} />
          {errors.documentNumber && (
            <p className="text-sm text-[var(--color-danger)]">{errors.documentNumber.message}</p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="taxCondition">Condición fiscal</Label>
          <Select
            value={watch('taxCondition')}
            onValueChange={(v) => setValue('taxCondition', v as CustomerFormValues['taxCondition'])}
          >
            <SelectTrigger id="taxCondition">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TAX_CONDITION_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register('email')} />
          {errors.email && <p className="text-sm text-[var(--color-danger)]">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" {...register('phone')} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="address">Dirección</Label>
          <Input id="address" {...register('address')} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" rows={3} {...register('notes')} />
        </div>
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando…' : submitLabel}
      </Button>
    </form>
  );
}
