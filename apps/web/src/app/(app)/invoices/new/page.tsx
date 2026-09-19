'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { roleHasPermission, type CreateInvoiceRequest, type InvoiceType } from '@dashgobo/contracts';
import { useCreateInvoice } from '@/lib/hooks/use-invoices';
import { useCustomers } from '@/lib/hooks/use-customers';
import { useProducts } from '@/lib/hooks/use-products';
import { useOrg } from '@/lib/org-context';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { formatMoney, minorUnitsToPesos, pesosToMinorUnits } from '@/lib/money';
import { previewInvoiceTotals } from '@/lib/invoice-preview';
import { INVOICE_TYPE_LABELS } from '@/lib/labels';
import { ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EntityPicker, type PickerOption } from '@/components/entity-picker';

interface ItemRowForm {
  isManual: boolean;
  productId?: string;
  productLabel?: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxRate: number;
}

interface InvoiceFormState {
  customerId: string;
  customerLabel: string;
  invoiceType: InvoiceType;
  pointOfSale: number;
  notes: string;
  items: ItemRowForm[];
}

const EMPTY_ITEM: ItemRowForm = {
  isManual: false,
  description: '',
  quantity: 1,
  unitPriceMinor: 0,
  taxRate: 21,
};

export default function NewInvoicePage() {
  const router = useRouter();
  const { membership } = useOrg();
  const createInvoice = useCreateInvoice();
  const canOverridePrice = membership ? roleHasPermission(membership.role, 'invoice:override_price') : false;

  const { register, control, handleSubmit, watch, setValue, formState } = useForm<InvoiceFormState>({
    defaultValues: {
      customerId: '',
      customerLabel: '',
      invoiceType: 'B',
      pointOfSale: 1,
      notes: '',
      items: [{ ...EMPTY_ITEM }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const [customerSearch, setCustomerSearch] = useState('');
  const debouncedCustomerSearch = useDebouncedValue(customerSearch);
  const { data: customerResults, isLoading: customersLoading } = useCustomers({
    search: debouncedCustomerSearch || undefined,
    pageSize: 10,
  });

  const items = watch('items');
  const preview = previewInvoiceTotals(
    items.map((item) => ({
      quantity: Number(item.quantity) || 0,
      unitPrice: item.unitPriceMinor || 0,
      taxRate: Number(item.taxRate) || 0,
    })),
  );

  async function onSubmit(values: InvoiceFormState) {
    const payload: CreateInvoiceRequest = {
      customerId: values.customerId,
      invoiceType: values.invoiceType,
      pointOfSale: values.pointOfSale,
      notes: values.notes || undefined,
      items: values.items.map((item) => ({
        productId: item.isManual ? undefined : item.productId,
        description: item.description || undefined,
        quantity: item.quantity,
        unitPrice: item.unitPriceMinor,
        taxRate: item.taxRate,
      })),
    };

    try {
      const invoice = await createInvoice.mutateAsync(payload);
      toast.success('Factura creada como borrador');
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'No se pudo crear la factura');
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva factura</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Se crea como borrador — la autorizás (y se le asigna número y CAE) en el paso siguiente.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Cliente *</Label>
              <EntityPicker
                value={
                  watch('customerId') ? { id: watch('customerId'), label: watch('customerLabel') } : null
                }
                options={(customerResults?.data ?? []).map(
                  (c): PickerOption => ({
                    id: c.id,
                    label: c.name,
                    sublabel: `${c.documentType} ${c.documentNumber}`,
                  }),
                )}
                isLoading={customersLoading}
                search={customerSearch}
                onSearchChange={setCustomerSearch}
                onSelect={(option) => {
                  setValue('customerId', option.id);
                  setValue('customerLabel', option.label);
                }}
                placeholder="Buscar cliente…"
                emptyLabel="Sin resultados"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="invoiceType">Tipo</Label>
                <Select
                  value={watch('invoiceType')}
                  onValueChange={(v) => setValue('invoiceType', v as InvoiceType)}
                >
                  <SelectTrigger id="invoiceType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(INVOICE_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pointOfSale">Punto de venta</Label>
                <Input
                  id="pointOfSale"
                  type="number"
                  min={1}
                  {...register('pointOfSale', { valueAsNumber: true })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ítems</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => (
              <ItemRow
                key={field.id}
                index={index}
                canOverridePrice={canOverridePrice}
                register={register}
                watch={watch}
                setValue={setValue}
                onRemove={() => fields.length > 1 && remove(index)}
                canRemove={fields.length > 1}
              />
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => append({ ...EMPTY_ITEM })}>
              <Plus className="h-4 w-4" />
              Agregar ítem
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notas (opcional)</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              rows={2}
              className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              {...register('notes')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vista previa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">Subtotal</span>
              <span className="tabular-nums">{formatMoney(preview.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">Impuestos</span>
              <span className="tabular-nums">{formatMoney(preview.taxes)}</span>
            </div>
            <div className="flex justify-between border-t border-[var(--color-border)] pt-1 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(preview.total)}</span>
            </div>
            <p className="pt-1 text-xs text-[var(--color-muted)]">
              Estimado — el servidor vuelve a calcular todo antes de guardar.
            </p>
          </CardContent>
        </Card>

        <Button type="submit" disabled={formState.isSubmitting || !watch('customerId')} size="lg">
          {formState.isSubmitting ? 'Creando…' : 'Crear borrador'}
        </Button>
      </form>
    </div>
  );
}

function ItemRow({
  index,
  canOverridePrice,
  register,
  watch,
  setValue,
  onRemove,
  canRemove,
}: {
  index: number;
  canOverridePrice: boolean;
  register: ReturnType<typeof useForm<InvoiceFormState>>['register'];
  watch: ReturnType<typeof useForm<InvoiceFormState>>['watch'];
  setValue: ReturnType<typeof useForm<InvoiceFormState>>['setValue'];
  onRemove: () => void;
  canRemove: boolean;
}) {
  const isManual = watch(`items.${index}.isManual`);
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productSearch);
  const { data: productResults, isLoading: productsLoading } = useProducts({
    search: debouncedProductSearch || undefined,
    active: true,
    pageSize: 10,
  });

  const productId = watch(`items.${index}.productId`);
  const productLabel = watch(`items.${index}.productLabel`);

  return (
    <div className="space-y-3 rounded-lg border border-[var(--color-border)] p-3">
      <div className="flex items-center justify-between">
        {canOverridePrice ? (
          <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <input
              type="checkbox"
              checked={isManual}
              onChange={(e) => setValue(`items.${index}.isManual`, e.target.checked)}
            />
            Ítem manual (sin catálogo)
          </label>
        ) : (
          <span />
        )}
        {canRemove && (
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Quitar ítem">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {isManual ? (
        <div className="space-y-1.5">
          <Label>Descripción *</Label>
          <Input {...register(`items.${index}.description`, { required: isManual })} />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>Producto/servicio *</Label>
          <EntityPicker
            value={productId ? { id: productId, label: productLabel ?? '' } : null}
            options={(productResults?.data ?? []).map(
              (p): PickerOption => ({
                id: p.id,
                label: p.name,
                sublabel: formatMoney(p.unitPrice, p.currency),
              }),
            )}
            isLoading={productsLoading}
            search={productSearch}
            onSearchChange={setProductSearch}
            onSelect={(option) => {
              const product = productResults?.data.find((p) => p.id === option.id);
              setValue(`items.${index}.productId`, option.id);
              setValue(`items.${index}.productLabel`, option.label);
              setValue(`items.${index}.description`, option.label);
              if (product) {
                setValue(`items.${index}.unitPriceMinor`, Number(product.unitPrice));
                setValue(`items.${index}.taxRate`, product.taxRate);
              }
            }}
            placeholder="Buscar producto…"
            emptyLabel="Sin resultados"
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Cantidad</Label>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            {...register(`items.${index}.quantity`, { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Precio unitario</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            disabled={!isManual && !canOverridePrice}
            defaultValue={
              watch(`items.${index}.unitPriceMinor`)
                ? minorUnitsToPesos(watch(`items.${index}.unitPriceMinor`))
                : undefined
            }
            onChange={(e) => setValue(`items.${index}.unitPriceMinor`, pesosToMinorUnits(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>IVA %</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            disabled={!isManual && !canOverridePrice}
            {...register(`items.${index}.taxRate`, { valueAsNumber: true })}
          />
        </div>
      </div>
    </div>
  );
}
