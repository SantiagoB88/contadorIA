'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerRequestSchema, type RegisterRequest } from '@dashgobo/contracts';
import { useAuth } from '@/lib/auth-context';
import { ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/components/shell/auth-layout';

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterRequest>({ resolver: zodResolver(registerRequestSchema) });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    try {
      await registerUser(data);
      router.push('/dashboard');
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'No se pudo crear la cuenta');
    }
  });

  return (
    <AuthLayout
      title="Crear cuenta"
      description="Se crea tu usuario y tu primera organización (vos quedás como OWNER)."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">Nombre</Label>
            <Input id="firstName" autoComplete="given-name" {...register('firstName')} />
            {errors.firstName && (
              <p className="text-sm text-[var(--color-danger)]">{errors.firstName.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Apellido</Label>
            <Input id="lastName" autoComplete="family-name" {...register('lastName')} />
            {errors.lastName && (
              <p className="text-sm text-[var(--color-danger)]">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          {errors.email && <p className="text-sm text-[var(--color-danger)]">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
          />
          {errors.password && (
            <p className="text-sm text-[var(--color-danger)]">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="organizationName">Nombre de tu empresa</Label>
          <Input id="organizationName" {...register('organizationName')} />
          {errors.organizationName && (
            <p className="text-sm text-[var(--color-danger)]">{errors.organizationName.message}</p>
          )}
        </div>

        {formError && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {formError}
          </p>
        )}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
        ¿Ya tenés cuenta?{' '}
        <Link href="/login" className="text-[var(--color-accent)] underline underline-offset-2">
          Iniciá sesión
        </Link>
      </p>
    </AuthLayout>
  );
}
