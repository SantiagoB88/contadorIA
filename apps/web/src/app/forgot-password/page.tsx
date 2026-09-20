'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  forgotPasswordRequestSchema,
  type ForgotPasswordRequest,
  type ForgotPasswordResponse,
} from '@dashgobo/contracts';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/components/shell/auth-layout';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState<ForgotPasswordResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordRequest>({ resolver: zodResolver(forgotPasswordRequestSchema) });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    try {
      const result = await apiFetch<ForgotPasswordResponse>('/auth/forgot-password', {
        method: 'POST',
        body: data,
      });
      setSent(result);
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Algo salió mal');
    }
  });

  if (sent) {
    return (
      <AuthLayout title="Revisá tu email" description={sent.message}>
        <div className="space-y-6">
          {sent.resetUrl && (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm">
              <p className="mb-1 font-medium">Modo desarrollo — no hay envío de email real:</p>
              <Link href={sent.resetUrl} className="break-all text-[var(--color-accent)] underline">
                {sent.resetUrl}
              </Link>
            </div>
          )}

          <Link href="/login" className="block text-center text-sm text-[var(--color-accent)] underline">
            Volver a iniciar sesión
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Recuperar contraseña"
      description="Ingresá tu email y te mandamos un link para elegir una nueva contraseña."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          {errors.email && <p className="text-sm text-[var(--color-danger)]">{errors.email.message}</p>}
        </div>

        {formError && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {formError}
          </p>
        )}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Enviando…' : 'Enviar link'}
        </Button>
      </form>

      <Link href="/login" className="mt-6 block text-center text-sm text-[var(--color-accent)] underline">
        Volver a iniciar sesión
      </Link>
    </AuthLayout>
  );
}
