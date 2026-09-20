'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordRequestSchema, type ResetPasswordRequest } from '@dashgobo/contracts';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/components/shell/auth-layout';

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordRequest>({
    resolver: zodResolver(resetPasswordRequestSchema),
    defaultValues: { token },
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    try {
      await apiFetch('/auth/reset-password', { method: 'POST', body: data });
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'No se pudo cambiar la contraseña');
    }
  });

  if (!token) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-danger)]">
          Este link no tiene un token válido. Pedí uno nuevo.
        </p>
        <Link href="/forgot-password" className="text-sm text-[var(--color-accent)] underline">
          Ir a recuperar contraseña
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        Contraseña actualizada. Te redirigimos al login…
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" {...register('token')} />
      <div className="space-y-1.5">
        <Label htmlFor="newPassword">Nueva contraseña</Label>
        <Input id="newPassword" type="password" autoComplete="new-password" {...register('newPassword')} />
        {errors.newPassword && (
          <p className="text-sm text-[var(--color-danger)]">{errors.newPassword.message}</p>
        )}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {formError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Guardando…' : 'Cambiar contraseña'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      title="Elegí una nueva contraseña"
      description="Esto cierra sesión en todos tus dispositivos por seguridad."
    >
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  );
}
