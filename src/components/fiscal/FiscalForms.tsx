"use client";

import { ActionForm, useActionForm } from "@/components/ActionForm";
import type { FormState } from "@/modules/admin/actions";
import {
  createObligationAction,
  createScaleAction,
  debtReviewAction,
  setCategoryAction,
  updateObligationStatusAction,
  updateScaleAction,
} from "@/modules/fiscal/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Feedback, FieldError } from "@/components/forms";
import { inputClass, labelClass } from "@/components/ui";

const CODES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];

function useForm(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  const [state, formAction] = useActionForm<FormState>(action, {});
  const v = state.ok ? {} : (state.values ?? {});
  const e = state.fieldErrors ?? {};
  return { state, formAction, v, e };
}

/** Atributos comunes de accesibilidad para un campo con posible error. */
function errorProps(id: string, e: Record<string, string>) {
  return { "aria-invalid": !!e[id], "aria-describedby": e[id] ? `${id}-error` : undefined };
}

export type ScaleDefaults = {
  name: string;
  source: string;
  status: string;
  validFrom: string;
  validTo: string;
  limits: Record<string, string>;
};

export function ScaleForm({ mode, scaleId, defaults }: { mode: "create" | "edit"; scaleId?: string; defaults: ScaleDefaults }) {
  const { state, formAction, v, e } = useForm(mode === "create" ? createScaleAction : updateScaleAction);
  const val = (key: string, fallback: string) => v[key] ?? fallback;

  return (
    <ActionForm form={formAction} className="space-y-5" noValidate>
      {scaleId && <input type="hidden" name="scaleId" value={scaleId} />}
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="name" className={labelClass}>
            Nombre
          </label>
          <input id="name" name="name" maxLength={120} defaultValue={val("name", defaults.name)} {...errorProps("name", e)} className={inputClass} />
          <FieldError id="name-error" message={e.name} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="source" className={labelClass}>
            Fuente
          </label>
          <input
            id="source"
            name="source"
            maxLength={300}
            placeholder="Norma, publicación o enlace oficial"
            defaultValue={val("source", defaults.source)}
            {...errorProps("source", e)}
            className={inputClass}
          />
          <FieldError id="source-error" message={e.source} />
        </div>
        <div>
          <label htmlFor="status" className={labelClass}>
            Estado
          </label>
          <select id="status" name="status" defaultValue={val("status", defaults.status)} {...errorProps("status", e)} className={inputClass}>
            <option value="DEMO">Ficticia (solo para pruebas)</option>
            <option value="VALIDADA">Validada (revisada contra la fuente)</option>
          </select>
          <FieldError id="status-error" message={e.status} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="validFrom" className={labelClass}>
              Vigente desde
            </label>
            <input id="validFrom" name="validFrom" type="date" defaultValue={val("validFrom", defaults.validFrom)} {...errorProps("validFrom", e)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="validTo" className={labelClass}>
              Hasta (opcional)
            </label>
            <input id="validTo" name="validTo" type="date" defaultValue={val("validTo", defaults.validTo)} {...errorProps("validTo", e)} className={inputClass} />
          </div>
          <div className="col-span-2">
            <FieldError id="validFrom-error" message={e.validFrom} />
            <FieldError id="validTo-error" message={e.validTo} />
          </div>
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Límite anual de ingresos por categoría (ARS)</legend>
        <p className="mt-1 text-xs text-slate-500">Cada categoría tiene que ser mayor que la anterior. Dejá vacía una categoría que la escala no tenga.</p>
        <FieldError id="limits-error" message={e.limits} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CODES.map((code) => {
            const id = `limit-${code}`;
            return (
              <div key={code}>
                <label htmlFor={id} className={labelClass}>
                  Categoría {code}
                </label>
                <input
                  id={id}
                  name={id}
                  inputMode="decimal"
                  defaultValue={val(id, defaults.limits[code] ?? "")}
                  {...errorProps(id, e)}
                  className={`${inputClass} tabular`}
                />
                <FieldError id={`${id}-error`} message={e[id]} />
              </div>
            );
          })}
        </div>
      </fieldset>

      {mode === "edit" && (
        <div>
          <label htmlFor="reason" className={labelClass}>
            Motivo del cambio
          </label>
          <input
            id="reason"
            name="reason"
            maxLength={300}
            placeholder="Ej.: corrección del límite de la categoría C según la fuente"
            defaultValue={v.reason ?? ""}
            {...errorProps("reason", e)}
            className={inputClass}
          />
          <FieldError id="reason-error" message={e.reason} />
          <p className="mt-1 text-xs text-slate-500">
            Cambiar una escala recalcula los indicadores de todas las fechas que cubre. Queda registrado en la auditoría.
          </p>
        </div>
      )}

      <SubmitButton pendingText="Guardando…">{mode === "create" ? "Crear versión" : "Guardar cambios"}</SubmitButton>
    </ActionForm>
  );
}

export function CategoryForm({
  taxpayerId,
  current,
  today,
}: {
  taxpayerId: string;
  current: string | null;
  today: string;
}) {
  const { state, formAction, v, e } = useForm(setCategoryAction);

  return (
    <ActionForm form={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="taxpayerId" value={taxpayerId} />
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="categoryCode" className={labelClass}>
            Categoría registrada
          </label>
          <select id="categoryCode" name="categoryCode" defaultValue={v.categoryCode ?? current ?? ""} {...errorProps("categoryCode", e)} className={inputClass}>
            <option value="">Sin categoría</option>
            {CODES.map((c) => (
              <option key={c} value={c}>
                Categoría {c}
              </option>
            ))}
          </select>
          <FieldError id="categoryCode-error" message={e.categoryCode} />
        </div>
        <div>
          <label htmlFor="catValidFrom" className={labelClass}>
            Rige desde
          </label>
          <input
            id="catValidFrom"
            name="validFrom"
            type="date"
            max={today}
            defaultValue={v.validFrom ?? today}
            aria-invalid={!!e.validFrom}
            aria-describedby={e.validFrom ? "catValidFrom-error" : undefined}
            className={inputClass}
          />
          <FieldError id="catValidFrom-error" message={e.validFrom} />
        </div>
      </div>
      <div>
        <label htmlFor="catReason" className={labelClass}>
          Motivo
        </label>
        <input
          id="catReason"
          name="reason"
          maxLength={300}
          placeholder="Ej.: recategorización informada por el cliente"
          defaultValue={v.reason ?? ""}
          aria-invalid={!!e.reason}
          aria-describedby={e.reason ? "catReason-error" : undefined}
          className={inputClass}
        />
        <FieldError id="catReason-error" message={e.reason} />
      </div>
      <SubmitButton pendingText="Guardando…">Registrar categoría</SubmitButton>
    </ActionForm>
  );
}

export function ObligationForm({ taxpayerId, currentMonth }: { taxpayerId: string; currentMonth: string }) {
  const { state, formAction, v, e } = useForm(createObligationAction);

  return (
    <ActionForm form={formAction} resetOnSuccess className="space-y-4" noValidate>
      <input type="hidden" name="taxpayerId" value={taxpayerId} />
      <Feedback state={state} />
      <div>
        <label htmlFor="concept" className={labelClass}>
          Concepto
        </label>
        <input
          id="concept"
          name="concept"
          maxLength={120}
          placeholder="Ej.: Cuota mensual del monotributo"
          defaultValue={v.concept ?? ""}
          {...errorProps("concept", e)}
          className={inputClass}
        />
        <FieldError id="concept-error" message={e.concept} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="period" className={labelClass}>
            Período
          </label>
          <input id="period" name="period" type="month" defaultValue={v.period ?? currentMonth} {...errorProps("period", e)} className={inputClass} />
          <FieldError id="period-error" message={e.period} />
        </div>
        <div>
          <label htmlFor="dueDate" className={labelClass}>
            Vencimiento
          </label>
          <input id="dueDate" name="dueDate" type="date" defaultValue={v.dueDate ?? ""} {...errorProps("dueDate", e)} className={inputClass} />
          <FieldError id="dueDate-error" message={e.dueDate} />
        </div>
        <div>
          <label htmlFor="obAmount" className={labelClass}>
            Importe (opcional)
          </label>
          <input
            id="obAmount"
            name="amount"
            inputMode="decimal"
            placeholder="Si no se conoce, vacío"
            defaultValue={v.amount ?? ""}
            aria-invalid={!!e.amount}
            aria-describedby={e.amount ? "obAmount-error" : undefined}
            className={`${inputClass} tabular`}
          />
          <FieldError id="obAmount-error" message={e.amount} />
        </div>
      </div>
      <SubmitButton pendingText="Guardando…">Cargar vencimiento</SubmitButton>
    </ActionForm>
  );
}

export function ObligationStatusForm({ obligationId, status }: { obligationId: string; status: string }) {
  const { state, formAction, v, e } = useForm(updateObligationStatusAction);
  const statusId = `status-${obligationId}`;
  const noteId = `note-${obligationId}`;

  return (
    <ActionForm form={formAction} className="space-y-2" noValidate>
      <input type="hidden" name="obligationId" value={obligationId} />
      <Feedback state={state} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={statusId} className="sr-only">
          Estado
        </label>
        <select id={statusId} name="status" defaultValue={v.status ?? status} className={`${inputClass} sm:w-56`}>
          <option value="PENDIENTE">Pendiente</option>
          <option value="PAGO_INFORMADO">Pago informado</option>
          <option value="PAGO_VERIFICADO">Pago verificado</option>
          <option value="ANULADA">Anulada</option>
        </select>
        <label htmlFor={noteId} className="sr-only">
          Evidencia o motivo
        </label>
        <input
          id={noteId}
          name="note"
          maxLength={300}
          placeholder="Evidencia o motivo"
          defaultValue={v.note ?? ""}
          aria-invalid={!!e.note}
          aria-describedby={e.note ? `${noteId}-error` : undefined}
          className={inputClass}
        />
        <SubmitButton pendingText="…" className="whitespace-nowrap">
          Actualizar
        </SubmitButton>
      </div>
      <FieldError id={`${noteId}-error`} message={e.note ?? e.status} />
    </ActionForm>
  );
}

export function DebtReviewForm({
  taxpayerId,
  today,
  current,
}: {
  taxpayerId: string;
  today: string;
  current: { asOfDate: string; status: string; note: string | null } | null;
}) {
  const { state, formAction, v, e } = useForm(debtReviewAction);

  return (
    <ActionForm form={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="taxpayerId" value={taxpayerId} />
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="asOfDate" className={labelClass}>
            Información al
          </label>
          <input id="asOfDate" name="asOfDate" type="date" max={today} defaultValue={v.asOfDate ?? today} {...errorProps("asOfDate", e)} className={inputClass} />
          <FieldError id="asOfDate-error" message={e.asOfDate} />
        </div>
        <div>
          <label htmlFor="reviewStatus" className={labelClass}>
            Estado de la revisión
          </label>
          <select id="reviewStatus" name="reviewStatus" defaultValue={v.reviewStatus ?? current?.status ?? "REVISADA"} {...errorProps("reviewStatus", e)} className={inputClass}>
            <option value="REVISADA">Revisada: la lista está completa a esa fecha</option>
            <option value="PENDIENTE_REVISION">Pendiente de revisión</option>
          </select>
          <FieldError id="reviewStatus-error" message={e.reviewStatus} />
        </div>
      </div>
      <div>
        <label htmlFor="reviewNote" className={labelClass}>
          Nota (opcional)
        </label>
        <input
          id="reviewNote"
          name="reviewNote"
          maxLength={300}
          placeholder="Ej.: revisado con el estado de cuenta del cliente"
          defaultValue={v.reviewNote ?? current?.note ?? ""}
          {...errorProps("reviewNote", e)}
          className={inputClass}
        />
        <FieldError id="reviewNote-error" message={e.reviewNote} />
      </div>
      <SubmitButton pendingText="Guardando…">Registrar revisión</SubmitButton>
    </ActionForm>
  );
}
