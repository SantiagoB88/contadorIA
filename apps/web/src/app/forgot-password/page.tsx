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
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-16">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Revisá tu email</h1>
          <p className="text-sm text-[var(--color-muted)]">{sent.message}</p>
        </div>

        {sent.resetUrl && (
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm">
            <p className="mb-1 font-medium">Modo desarrollo — no hay envío de email real:</p>
            <Link href={sent.resetUrl} className="break-all text-[var(--color-accent)] underline">
              {sent.resetUrl}
            </Link>
          </div>
        )}

        <Link href="/login" className="text-center text-sm text-[var(--color-accent)] underline">
          Volver a iniciar sesión
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Recuperar contraseña</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Ingresá tu email y te mandamos un link para elegir una nueva contraseña.
        </p>
      </div>

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

      <Link href="/login" className="text-center text-sm text-[var(--color-accent)] underline">
        Volver a iniciar sesión
      </Link>
    </main>
  );
}
