"use client";

import { useActionState } from "react";
import {
  approveRequestAction,
  changePasswordAction,
  rejectRequestAction,
  requestAssociationAction,
  revokeAccessAction,
  setUserActiveAction,
  updateProfileAction,
  type ActionState,
} from "@/modules/access/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Feedback, FieldError } from "@/components/forms";
import { inputClass, labelClass } from "@/components/ui";

const CATEGORIES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];

function Input({
  id,
  name,
  label,
  error,
  hint,
  ...input
}: { id: string; name: string; label: string; error?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={inputClass}
        {...input}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

// ---- Cliente ----

export function AssociationForm({ today }: { today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(requestAssociationAction, {});
  const v = state.ok ? {} : (state.values ?? {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input id="as-cuit" name="cuit" label="CUIT" inputMode="numeric" placeholder="20-12345678-6" defaultValue={v.cuit} error={e.cuit} />
        <Input id="as-name" name="name" label="Nombre o razón social" defaultValue={v.name} error={e.name} />
        <Input id="as-activity" name="activity" label="Actividad" placeholder="Ej.: Diseño gráfico" defaultValue={v.activity} error={e.activity} />
        <div>
          <label htmlFor="as-category" className={labelClass}>
            Categoría que tenés hoy
          </label>
          <select id="as-category" name="category" defaultValue={v.category ?? ""} className={inputClass} aria-invalid={!!e.category}>
            <option value="">No sé / no tengo</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                Categoría {c}
              </option>
            ))}
          </select>
          <FieldError id="as-category-error" message={e.category} />
        </div>
        <Input
          id="as-startDate"
          name="startDate"
          label="Inicio de actividad"
          type="date"
          max={today}
          defaultValue={v.startDate}
          error={e.startDate}
        />
      </div>
      <p className="text-xs text-slate-500">
        No te pedimos la clave fiscal. El estudio verifica que el CUIT sea tuyo antes de mostrarte información.
      </p>
      <SubmitButton pendingText="Enviando…">Enviar solicitud</SubmitButton>
    </form>
  );
}

export function ProfileForm({ name, phone, email }: { name: string; phone: string; email: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateProfileAction, {});
  const v = state.ok ? {} : (state.values ?? {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <Feedback state={state} />
      <Input id="pf-email" name="email" label="Correo electrónico" value={email} readOnly disabled hint="El correo no se puede cambiar por ahora." />
      <Input id="pf-name" name="name" label="Nombre y apellido" autoComplete="name" defaultValue={v.name ?? name} error={e.name} />
      <Input id="pf-phone" name="phone" label="Teléfono" type="tel" autoComplete="tel" defaultValue={v.phone ?? phone} error={e.phone} />
      <SubmitButton pendingText="Guardando…">Guardar datos</SubmitButton>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(changePasswordAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <Feedback state={state} />
      <Input id="pw-current" name="current" label="Contraseña actual" type="password" autoComplete="current-password" error={e.current} />
      <Input
        id="pw-next"
        name="next"
        label="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        hint="Mínimo 8 caracteres, con al menos una letra y un número."
        error={e.next}
      />
      <Input id="pw-confirm" name="confirm" label="Repetí la contraseña nueva" type="password" autoComplete="new-password" error={e.confirm} />
      <SubmitButton pendingText="Guardando…">Cambiar contraseña</SubmitButton>
      <p className="text-xs text-slate-500">Al cambiarla se cierran tus sesiones en otros dispositivos.</p>
    </form>
  );
}

// ---- Administrador ----

export function ReviewRequestForms({ requestId, declaredCategory }: { requestId: string; declaredCategory: string | null }) {
  const [approveState, approve] = useActionState<ActionState, FormData>(approveRequestAction, {});
  const [rejectState, reject] = useActionState<ActionState, FormData>(rejectRequestAction, {});

  if (approveState.ok || rejectState.ok) return <Feedback state={approveState.ok ? approveState : rejectState} />;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form action={approve} className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4" noValidate>
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm font-semibold text-emerald-900">Aprobar</p>
        <Feedback state={approveState} />
        <div>
          <label htmlFor={`cat-${requestId}`} className={labelClass}>
            Categoría registrada (si el contribuyente es nuevo)
          </label>
          <select id={`cat-${requestId}`} name="category" defaultValue={declaredCategory ?? ""} className={inputClass}>
            <option value="">Sin categoría</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                Categoría {c}
              </option>
            ))}
          </select>
          <FieldError id={`cat-${requestId}-error`} message={approveState.fieldErrors?.category} />
        </div>
        <Input id={`note-ok-${requestId}`} name="note" label="Nota (opcional)" maxLength={300} />
        <SubmitButton pendingText="Aprobando…">Aprobar acceso</SubmitButton>
      </form>

      <form action={reject} className="space-y-3 rounded-lg border border-slate-200 p-4" noValidate>
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm font-semibold text-slate-800">Rechazar</p>
        <Feedback state={rejectState} />
        <Input
          id={`note-no-${requestId}`}
          name="note"
          label="Motivo (lo ve el cliente)"
          maxLength={300}
          defaultValue={rejectState.values?.note}
          error={rejectState.fieldErrors?.note}
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2.5 font-medium text-red-700 hover:bg-red-50"
        >
          Rechazar solicitud
        </button>
      </form>
    </div>
  );
}

export function RevokeAccessForm({ accessId }: { accessId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(revokeAccessAction, {});
  if (state.ok) return <Feedback state={state} />;
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start" noValidate>
      <input type="hidden" name="accessId" value={accessId} />
      <div className="flex-1">
        <label htmlFor={`rv-${accessId}`} className="sr-only">
          Motivo de la revocación
        </label>
        <input
          id={`rv-${accessId}`}
          name="reason"
          placeholder="Motivo de la revocación"
          maxLength={300}
          defaultValue={state.values?.reason}
          aria-invalid={!!state.fieldErrors?.reason}
          className={`${inputClass} py-2 text-sm`}
        />
        <FieldError id={`rv-${accessId}-error`} message={state.fieldErrors?.reason ?? (state.ok === false ? state.message : undefined)} />
      </div>
      <button
        type="submit"
        className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Revocar
      </button>
    </form>
  );
}

export function UserStatusForm({ userId, active }: { userId: string; active: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(setUserActiveAction, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <button
        type="submit"
        className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
          active ? "border-red-300 text-red-700 hover:bg-red-50" : "border-emerald-300 text-emerald-800 hover:bg-emerald-50"
        }`}
      >
        {active ? "Suspender" : "Reactivar"}
      </button>
      {state.message && !state.ok && <p className="text-xs text-red-700">{state.message}</p>}
    </form>
  );
}
