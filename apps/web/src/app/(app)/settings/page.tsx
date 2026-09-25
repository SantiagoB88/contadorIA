'use client';

import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateOrganizationRequestSchema, type UpdateOrganizationRequest } from '@dashgobo/contracts';
import { useOrganization, useUpdateOrganization } from '@/lib/hooks/use-organizations';
import { useOrg } from '@/lib/org-context';
import { ApiRequestError } from '@/lib/api';
import { TAX_CONDITION_LABELS } from '@/lib/labels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function SettingsPage() {
  const { membership } = useOrg();
  const { data: organization, isLoading } = useOrganization();
  const updateOrganization = useUpdateOrganization();
  const canEdit = membership?.role === 'OWNER' || membership?.role === 'ADMIN';

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UpdateOrganizationRequest>({
    resolver: zodResolver(updateOrganizationRequestSchema),
    values: organization
      ? {
          name: organization.name,
          legalName: organization.legalName ?? undefined,
          cuit: organization.cuit ?? undefined,
          taxCondition: organization.taxCondition,
          email: organization.email ?? undefined,
          phone: organization.phone ?? undefined,
          address: organization.address ?? undefined,
          timezone: organization.timezone,
          defaultCurrency: organization.defaultCurrency,
        }
      : undefined,
  });

  async function onSubmit(values: UpdateOrganizationRequest) {
    try {
      await updateOrganization.mutateAsync(values);
      toast.success('Datos actualizados');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'No se pudo actualizar');
    }
  }

  if (isLoading || !organization) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Mi empresa</h1>
      <p className="mb-6 text-sm text-[var(--color-muted)]">Datos fiscales de tu organización.</p>

      {!canEdit && (
        <p className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-muted)]">
          Solo el propietario o un administrador pueden editar estos datos.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Datos de la organización</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <fieldset disabled={!canEdit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nombre comercial</Label>
                  <Input id="name" {...register('name')} />
                  {errors.name && (
                    <p className="text-sm text-[var(--color-danger)]">{errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="legalName">Razón social</Label>
                  <Input id="legalName" {...register('legalName')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cuit">CUIT</Label>
                  <Input id="cuit" placeholder="20-12345678-3" {...register('cuit')} />
                  {errors.cuit && (
                    <p className="text-sm text-[var(--color-danger)]">{errors.cuit.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="taxCondition">Condición fiscal</Label>
                  <Select
                    value={watch('taxCondition')}
                    onValueChange={(v) =>
                      setValue('taxCondition', v as UpdateOrganizationRequest['taxCondition'])
                    }
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
                  {errors.email && (
                    <p className="text-sm text-[var(--color-danger)]">{errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" {...register('phone')} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="address">Dirección</Label>
                  <Input id="address" {...register('address')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="defaultCurrency">Moneda</Label>
                  <Input id="defaultCurrency" maxLength={3} {...register('defaultCurrency')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="timezone">Zona horaria</Label>
                  <Input id="timezone" {...register('timezone')} />
                </div>
              </div>

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </fieldset>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
