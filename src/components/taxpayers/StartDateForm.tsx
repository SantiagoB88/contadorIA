"use client";

import { ActionForm, useActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Feedback, FieldError } from "@/components/forms";
import { inputClass, labelClass } from "@/components/ui";
import { setStartDateAction, type StartDateState } from "@/modules/taxpayers/actions";

/** Carga (o, para el estudio, corrección) de la fecha de inicio de actividad. */
export function StartDateForm({
  taxpayerId,
  current,
  compact = false,
  from = "dashboard",
}: {
  taxpayerId: string;
  current?: string | null;
  compact?: boolean;
  from?: "dashboard" | "admin";
}) {
  const [state, action] = useActionForm<StartDateState>(setStartDateAction, {});
  const error = state.fieldErrors?.startDate;
  return (
    <ActionForm form={action} className={compact ? "flex flex-wrap items-end gap-3" : "space-y-3"}>
      <input type="hidden" name="taxpayerId" value={taxpayerId} />
      <input type="hidden" name="from" value={from} />
      <div>
        <label htmlFor={`start-${taxpayerId}`} className={labelClass}>
          Fecha de inicio de actividad
        </label>
        <input
          id={`start-${taxpayerId}`}
          name="startDate"
          type="date"
          required
          defaultValue={state.value ?? current ?? ""}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `start-${taxpayerId}-error` : undefined}
          className={inputClass}
        />
        <FieldError id={`start-${taxpayerId}-error`} message={error} />
      </div>
      <SubmitButton pendingText="Guardando…">{current ? "Corregir fecha" : "Guardar fecha"}</SubmitButton>
      {state.message && !error && <Feedback state={state} />}
    </ActionForm>
  );
}
