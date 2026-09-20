'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, type LoginRequest } from '@dashgobo/contracts';
import { useAuth } from '@/lib/auth-context';
import { ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/components/shell/auth-layout';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({ resolver: zodResolver(loginRequestSchema) });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    try {
      await login(data);
      router.push('/dashboard');
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'No se pudo iniciar sesión');
    }
  });

  return (
    <AuthLayout title="Iniciar sesión" description="Entrá a tu cuenta de DashGoBo.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          {errors.email && <p className="text-sm text-[var(--color-danger)]">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <Link href="/forgot-password" className="text-xs text-[var(--color-accent)] hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
          {errors.password && (
            <p className="text-sm text-[var(--color-danger)]">{errors.password.message}</p>
          )}
        </div>

        {formError && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {formError}
          </p>
        )}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
        ¿No tenés cuenta?{' '}
        <Link href="/register" className="text-[var(--color-accent)] underline underline-offset-2">
          Registrate
        </Link>
      </p>
    </AuthLayout>
  );
}
