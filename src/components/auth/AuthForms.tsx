"use client";

import Link from "next/link";
import { ActionForm, useActionForm } from "@/components/ActionForm";
import {
  registerAction,
  requestResetAction,
  resetPasswordAction,
  verifyEmailAction,
  type AuthFormState,
} from "@/modules/auth/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Feedback, FieldError } from "@/components/forms";
import { inputClass, labelClass } from "@/components/ui";

function Field({
  id,
  label,
  error,
  hint,
  ...input
}: { id: string; label: string; error?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input id={id} name={id} aria-invalid={!!error} aria-describedby={describedBy} className={inputClass} {...input} />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

const BackToLogin = () => (
  <Link
    href="/login"
    className="inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700"
  >
    Ir a ingresar
  </Link>
);

export function RegisterForm() {
  const [state, action] = useActionForm<AuthFormState>(registerAction, {});
  if (state.ok) {
    return (
      <div className="space-y-4">
        <Feedback state={state} />
        <BackToLogin />
      </div>
    );
  }
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  return (
    <ActionForm form={action} className="space-y-4" noValidate>
      <Feedback state={state} />
      <Field id="name" label="Nombre y apellido" autoComplete="name" defaultValue={v.name} error={e.name} />
      <Field id="email" label="Correo electrónico" type="email" autoComplete="email" defaultValue={v.email} error={e.email} />
      <Field
        id="phone"
        label="Teléfono"
        type="tel"
        autoComplete="tel"
        placeholder="+54 11 5555-5555"
        defaultValue={v.phone}
        error={e.phone}
      />
      <Field
        id="password"
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        hint="Mínimo 8 caracteres, con al menos una letra y un número."
        error={e.password}
      />
      <Field id="confirm" label="Repetí la contraseña" type="password" autoComplete="new-password" error={e.confirm} />
      <SubmitButton pendingText="Creando cuenta…" className="w-full">
        Crear cuenta
      </SubmitButton>
      <p className="text-xs text-slate-500">
        Tu CUIT lo cargás después de confirmar el correo. El estudio valida la asociación antes de mostrarte datos fiscales.
      </p>
    </ActionForm>
  );
}

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, action] = useActionForm<AuthFormState>(verifyEmailAction, {});
  if (state.message) {
    return (
      <div className="space-y-4">
        <Feedback state={state} />
        <BackToLogin />
      </div>
    );
  }
  return (
    <ActionForm form={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-slate-600">Tocá el botón para confirmar que este correo es tuyo.</p>
      <SubmitButton pendingText="Confirmando…" className="w-full">
        Confirmar mi correo
      </SubmitButton>
    </ActionForm>
  );
}

export function RequestResetForm() {
  const [state, action] = useActionForm<AuthFormState>(requestResetAction, {});
  if (state.ok) {
    return (
      <div className="space-y-4">
        <Feedback state={state} />
        <BackToLogin />
      </div>
    );
  }
  return (
    <ActionForm form={action} className="space-y-4" noValidate>
      <Feedback state={state} />
      <Field id="email" label="Correo electrónico" type="email" autoComplete="email" defaultValue={state.values?.email} />
      <SubmitButton pendingText="Enviando…" className="w-full">
        Enviar enlace
      </SubmitButton>
    </ActionForm>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionForm<AuthFormState>(resetPasswordAction, {});
  if (state.ok) {
    return (
      <div className="space-y-4">
        <Feedback state={state} />
        <BackToLogin />
      </div>
    );
  }
  const e = state.fieldErrors ?? {};
  return (
    <ActionForm form={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <Feedback state={state} />
      <Field
        id="password"
        label="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        hint="Mínimo 8 caracteres, con al menos una letra y un número."
        error={e.password}
      />
      <Field id="confirm" label="Repetí la contraseña" type="password" autoComplete="new-password" error={e.confirm} />
      <SubmitButton pendingText="Guardando…" className="w-full">
        Guardar contraseña
      </SubmitButton>
    </ActionForm>
  );
}
