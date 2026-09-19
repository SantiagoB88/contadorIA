'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createProductRequestSchema,
  type CreateProductRequest,
  type Product,
} from '@dashgobo/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { minorUnitsToPesos, pesosToMinorUnits } from '@/lib/money';

export interface ProductFormValues extends CreateProductRequest {
  active?: boolean;
}

export function ProductForm({
  defaultValues,
  onSubmit,
  submitLabel,
  showActiveToggle = false,
}: {
  defaultValues?: Partial<Product>;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  submitLabel: string;
  showActiveToggle?: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(createProductRequestSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? undefined,
      sku: defaultValues?.sku ?? undefined,
      type: defaultValues?.type ?? 'SERVICE',
      unitPrice: defaultValues?.unitPrice ? Number(defaultValues.unitPrice) : 0,
      currency: defaultValues?.currency ?? 'ARS',
      taxRate: defaultValues?.taxRate ?? 21,
      active: defaultValues?.active ?? true,
    },
  });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="max-w-2xl space-y-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">Nombre *</Label>
          <Input id="name" {...register('name')} />
          {errors.name && <p className="text-sm text-[var(--color-danger)]">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="type">Tipo</Label>
          <Select value={watch('type')} onValueChange={(v) => setValue('type', v as 'GOOD' | 'SERVICE')}>
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SERVICE">Servicio</SelectItem>
              <SelectItem value="GOOD">Bien</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" {...register('sku')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="unitPrice">Precio (ARS) *</Label>
          <Input
            id="unitPrice"
            type="number"
            step="0.01"
            min="0"
            defaultValue={
              defaultValues?.unitPrice ? minorUnitsToPesos(defaultValues.unitPrice) : undefined
            }
            onChange={(e) => setValue('unitPrice', pesosToMinorUnits(e.target.value))}
          />
          {errors.unitPrice && (
            <p className="text-sm text-[var(--color-danger)]">{errors.unitPrice.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="taxRate">Alícuota IVA (%)</Label>
          <Input id="taxRate" type="number" step="0.01" min="0" max="100" {...register('taxRate')} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea id="description" rows={3} {...register('description')} />
        </div>

        {showActiveToggle && (
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={watch('active')} onCheckedChange={(v) => setValue('active', v)} />
            <Label>Activo (visible al facturar)</Label>
          </div>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando…' : submitLabel}
      </Button>
    </form>
  );
}
