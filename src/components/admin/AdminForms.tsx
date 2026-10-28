"use client";

import { useActionState } from "react";
import {
  addInvoiceAction,
  updateCategoryAction,
  updateCoverageAction,
  type FormState,
} from "@/modules/admin/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Feedback, FieldError } from "@/components/forms";
import { inputClass, labelClass } from "@/components/ui";

export function InvoiceForm({ taxpayerId, today }: { taxpayerId: string; today: string }) {
  const [state, action] = useActionState<FormState, FormData>(addInvoiceAction, {});
  const v = state.ok ? {} : (state.values ?? {});
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="taxpayerId" value={taxpayerId} />
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="issueDate" className={labelClass}>
            Fecha
          </label>
          <input
            id="issueDate"
            name="issueDate"
            type="date"
            max={today}
            defaultValue={v.issueDate ?? today}
            aria-invalid={!!e.issueDate}
            aria-describedby={e.issueDate ? "issueDate-error" : undefined}
            className={inputClass}
          />
          <FieldError id="issueDate-error" message={e.issueDate} />
        </div>
        <div>
          <label htmlFor="amount" className={labelClass}>
            Importe (ARS)
          </label>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            placeholder="150.000,00"
            defaultValue={v.amount ?? ""}
            aria-invalid={!!e.amount}
            aria-describedby={e.amount ? "amount-error" : undefined}
            className={`${inputClass} tabular`}
          />
          <FieldError id="amount-error" message={e.amount} />
        </div>
      </div>
      <div>
        <label htmlFor="recipientName" className={labelClass}>
          Receptor
        </label>
        <input
          id="recipientName"
          name="recipientName"
          maxLength={120}
          placeholder="Nombre o razón social"
          defaultValue={v.recipientName ?? ""}
          aria-invalid={!!e.recipientName}
          aria-describedby={e.recipientName ? "recipientName-error" : undefined}
          className={inputClass}
        />
        <FieldError id="recipientName-error" message={e.recipientName} />
      </div>
      <div>
        <label htmlFor="description" className={labelClass}>
          Concepto
        </label>
        <input
          id="description"
          name="description"
          maxLength={200}
          placeholder="Ej.: Servicios de diseño"
          defaultValue={v.description ?? ""}
          aria-invalid={!!e.description}
          aria-describedby={e.description ? "description-error" : undefined}
          className={inputClass}
        />
        <FieldError id="description-error" message={e.description} />
      </div>
      <SubmitButton pendingText="Guardando…">Cargar comprobante</SubmitButton>
    </form>
  );
}

export function CategoryForm({
  taxpayerId,
  current,
  codes,
}: {
  taxpayerId: string;
  current: string | null;
  codes: string[];
}) {
  const [state, action] = useActionState<FormState, FormData>(updateCategoryAction, {});
  const v = state.ok ? {} : (state.values ?? {});
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="taxpayerId" value={taxpayerId} />
      <Feedback state={state} />
      <div>
        <label htmlFor="categoryCode" className={labelClass}>
          Categoría registrada
        </label>
        <select
          id="categoryCode"
          name="categoryCode"
          defaultValue={v.categoryCode ?? current ?? ""}
          aria-invalid={!!e.categoryCode}
          className={inputClass}
        >
          <option value="">Sin categoría</option>
          {codes.map((c) => (
            <option key={c} value={c}>
              Categoría {c}
            </option>
          ))}
        </select>
        <FieldError id="categoryCode-error" message={e.categoryCode} />
      </div>
      <div>
        <label htmlFor="reason" className={labelClass}>
          Motivo
        </label>
        <input
          id="reason"
          name="reason"
          maxLength={300}
          placeholder="Ej.: recategorización informada por el cliente"
          defaultValue={v.reason ?? ""}
          aria-invalid={!!e.reason}
          aria-describedby={e.reason ? "reason-error" : undefined}
          className={inputClass}
        />
        <FieldError id="reason-error" message={e.reason} />
      </div>
      <SubmitButton pendingText="Guardando…">Guardar categoría</SubmitButton>
    </form>
  );
}

export function CoverageForm({
  taxpayerId,
  fromDate,
  complete,
  today,
}: {
  taxpayerId: string;
  fromDate: string | null;
  complete: boolean;
  today: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(updateCoverageAction, {});
  const v = state.ok ? {} : (state.values ?? {});
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="taxpayerId" value={taxpayerId} />
      <Feedback state={state} />
      <div>
        <label htmlFor="fromDate" className={labelClass}>
          Hay datos cargados desde
        </label>
        <input
          id="fromDate"
          name="fromDate"
          type="date"
          max={today}
          defaultValue={v.fromDate ?? fromDate ?? ""}
          aria-invalid={!!e.fromDate}
          aria-describedby={e.fromDate ? "fromDate-error" : undefined}
          className={inputClass}
        />
        <FieldError id="fromDate-error" message={e.fromDate} />
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="complete"
          defaultChecked={v.complete !== undefined ? v.complete === "on" : complete}
          className="mt-0.5 h-4 w-4 accent-brand-600"
        />
        <span>Confirmo que desde esa fecha están cargados todos los comprobantes</span>
      </label>
      <SubmitButton pendingText="Guardando…">Guardar cobertura</SubmitButton>
    </form>
  );
}
