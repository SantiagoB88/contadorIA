"use client";

import { ActionForm, useActionForm } from "@/components/ActionForm";
import { loginAction, type LoginState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { inputClass, labelClass } from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionForm<LoginState>(loginAction, {});

  return (
    <ActionForm form={formAction} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.info && (
        <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          {state.info}
        </p>
      )}
      {state.whatsapp && (
        <div role="status" className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
          <p className="font-semibold">Falta confirmar tu cuenta</p>
          <p>
            Mandá este código por WhatsApp al asistente de ContadorIA <strong>desde tu celular</strong> (vence en{" "}
            {state.whatsapp.minutes} minutos):
          </p>
          <p className="tabular text-center text-2xl font-bold tracking-[0.3em] text-navy">{state.whatsapp.code}</p>
          {state.whatsapp.url && (
            <a
              href={state.whatsapp.url}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center rounded-lg bg-[#1f8f4e] px-4 py-2.5 font-medium text-white hover:bg-[#187540]"
            >
              Abrir WhatsApp con el código
            </a>
          )}
          <p>Cuando el asistente te confirme, tocá <strong>Ingresar</strong> de nuevo.</p>
          {state.whatsapp.mailSent && (
            <p className="text-emerald-900">También te mandamos un enlace a tu correo: abrirlo confirma la cuenta igual.</p>
          )}
        </div>
      )}
      <div>
        <label htmlFor="email" className={labelClass}>
          Correo, CUIT o DNI
        </label>
        <input
          id="email"
          name="email"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.email ?? ""}
          className={inputClass}
          placeholder="nombre@correo.com o 20123456783"
        />
        <p className="mt-1 text-xs text-slate-500">Con CUIT o DNI, una vez que el estudio aprobó tu acceso.</p>
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>
          Contraseña
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </div>
      <SubmitButton pendingText="Ingresando…" className="w-full">
        Ingresar
      </SubmitButton>
    </ActionForm>
  );
}
