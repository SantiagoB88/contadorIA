"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { inputClass, labelClass } from "@/components/ui";

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <div>
        <label htmlFor="email" className={labelClass}>
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email ?? ""}
          className={inputClass}
          placeholder="nombre@correo.com"
        />
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
    </form>
  );
}
