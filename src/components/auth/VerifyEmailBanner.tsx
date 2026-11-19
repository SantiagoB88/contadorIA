"use client";

import { ActionForm, useActionForm } from "@/components/ActionForm";
import { resendVerificationAction, type AuthFormState } from "@/modules/auth/actions";

/** Cuenta confirmada por WhatsApp que todavía no confirmó el correo: segundo paso, sin bloquear nada. */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [state, action] = useActionForm<AuthFormState>(resendVerificationAction, {});
  return (
    <div role="status" className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900">
      <ActionForm form={action} className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
        <span>
          Falta confirmar tu correo <strong className="break-all">{email}</strong>: abrí el enlace que te mandamos.
        </span>
        {state.message ? (
          <span className={state.ok ? "font-medium" : "font-medium text-red-800"}>{state.message}</span>
        ) : (
          <button type="submit" disabled={action.pending} className="font-medium underline disabled:opacity-60">
            {action.pending ? "Enviando…" : "Reenviar el correo"}
          </button>
        )}
      </ActionForm>
    </div>
  );
}
