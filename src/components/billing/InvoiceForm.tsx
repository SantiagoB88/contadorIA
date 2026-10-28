"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { saveDraftAction, type DraftFormState } from "@/modules/billing/actions";
import type { DraftInput } from "@/modules/billing/service";
import { formatARS, lineSubtotalCents, parseAmountToCents, parseQuantityMilli } from "@/lib/money";
import { SubmitButton } from "@/components/SubmitButton";
import { Feedback, FieldError } from "@/components/forms";
import { inputClass, labelClass } from "@/components/ui";

type Recipient = { id: string; label: string };
type Row = { key: number; description: string; quantity: string; unitPrice: string };

const MAX_ROWS = 20;

const DOC_TYPES = [
  { value: "CUIT", label: "CUIT" },
  { value: "DNI", label: "DNI" },
  { value: "SIN_IDENTIFICAR", label: "Sin identificar" },
];
const TAX_CONDITIONS = [
  { value: "CONSUMIDOR_FINAL", label: "Consumidor final" },
  { value: "RESPONSABLE_INSCRIPTO", label: "Responsable inscripto" },
  { value: "MONOTRIBUTO", label: "Monotributista" },
  { value: "EXENTO", label: "Exento" },
];

let nextKey = 1;
const toRows = (items: DraftInput["items"]): Row[] =>
  (items.length ? items : [{ description: "", quantity: "1", unitPrice: "" }]).map((it) => ({ key: nextKey++, ...it }));

export function InvoiceForm({
  taxpayerId,
  recipients,
  initial,
  invoiceId,
  today,
  minDate,
}: {
  taxpayerId: string;
  recipients: Recipient[];
  initial: DraftInput;
  invoiceId?: string;
  today: string;
  minDate: string;
}) {
  const [state, action] = useActionState<DraftFormState, FormData>(saveDraftAction, {});
  const v = state.values ?? initial;
  const e = state.fieldErrors ?? {};

  const [mode, setMode] = useState<"existente" | "nuevo">(
    initial.recipientMode === "existente" && recipients.length > 0 ? "existente" : "nuevo",
  );
  const [docType, setDocType] = useState(initial.docType || "CUIT");
  const [rows, setRows] = useState<Row[]>(() => toRows(initial.items));

  // Vista previa del total. El total que vale es el que recalcula el servidor al guardar.
  const preview = useMemo(() => {
    let total = 0n;
    const subtotals = rows.map((r) => {
      const q = parseQuantityMilli(r.quantity);
      const p = parseAmountToCents(r.unitPrice);
      if (q === null || p === null) return null;
      const s = lineSubtotalCents(q, p);
      total += s;
      return s;
    });
    return { subtotals, total };
  }, [rows]);

  const update = (key: number, field: keyof Omit<Row, "key">, value: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  const addRow = () =>
    setRows((rs) => (rs.length >= MAX_ROWS ? rs : [...rs, { key: nextKey++, description: "", quantity: "1", unitPrice: "" }]));
  const removeRow = (key: number) => setRows((rs) => (rs.length === 1 ? rs : rs.filter((r) => r.key !== key)));

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="taxpayerId" value={taxpayerId} />
      {invoiceId && <input type="hidden" name="invoiceId" value={invoiceId} />}
      <Feedback state={state} />

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-slate-900">1. Receptor</legend>
        {recipients.length > 0 && (
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="recipientMode"
                value="existente"
                checked={mode === "existente"}
                onChange={() => setMode("existente")}
                className="accent-brand-600"
              />
              Uno guardado
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="recipientMode"
                value="nuevo"
                checked={mode === "nuevo"}
                onChange={() => setMode("nuevo")}
                className="accent-brand-600"
              />
              Uno nuevo
            </label>
          </div>
        )}
        {recipients.length === 0 && <input type="hidden" name="recipientMode" value="nuevo" />}

        {mode === "existente" ? (
          <div className="max-w-md">
            <label htmlFor="recipientId" className={labelClass}>
              Receptor
            </label>
            <select id="recipientId" name="recipientId" defaultValue={v.recipientId} className={inputClass} aria-invalid={!!e.recipientId}>
              <option value="">Elegí un receptor</option>
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <FieldError id="recipientId-error" message={e.recipientId} />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="recipientName" className={labelClass}>
                Nombre o razón social
              </label>
              <input
                id="recipientName"
                name="recipientName"
                maxLength={120}
                defaultValue={v.recipientName}
                aria-invalid={!!e.recipientName}
                className={inputClass}
              />
              <FieldError id="recipientName-error" message={e.recipientName} />
            </div>
            <div>
              <label htmlFor="taxCondition" className={labelClass}>
                Condición frente al IVA
              </label>
              <select
                id="taxCondition"
                name="taxCondition"
                defaultValue={v.taxCondition || "CONSUMIDOR_FINAL"}
                aria-invalid={!!e.taxCondition}
                className={inputClass}
              >
                {TAX_CONDITIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <FieldError id="taxCondition-error" message={e.taxCondition} />
            </div>
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <div>
                <label htmlFor="docType" className={labelClass}>
                  Documento
                </label>
                <select
                  id="docType"
                  name="docType"
                  value={docType}
                  onChange={(ev) => setDocType(ev.target.value)}
                  aria-invalid={!!e.docType}
                  className={inputClass}
                >
                  {DOC_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="docNumber" className={labelClass}>
                  Número
                </label>
                <input
                  id="docNumber"
                  name="docNumber"
                  inputMode="numeric"
                  disabled={docType === "SIN_IDENTIFICAR"}
                  placeholder={docType === "CUIT" ? "20-12345678-6" : docType === "DNI" ? "12345678" : "—"}
                  defaultValue={v.docNumber}
                  aria-invalid={!!e.docNumber}
                  className={`${inputClass} disabled:bg-slate-100`}
                />
              </div>
              <div className="col-span-2">
                <FieldError id="docType-error" message={e.docType} />
                <FieldError id="docNumber-error" message={e.docNumber} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input type="checkbox" name="saveRecipient" defaultChecked={v.saveRecipient} className="h-4 w-4 accent-brand-600" />
              Guardar este receptor para próximas facturas
            </label>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-slate-900">2. Detalle</legend>
        <div className="max-w-xs">
          <label htmlFor="issueDate" className={labelClass}>
            Fecha del comprobante
          </label>
          <input
            id="issueDate"
            name="issueDate"
            type="date"
            min={minDate}
            max={today}
            defaultValue={v.issueDate || today}
            aria-invalid={!!e.issueDate}
            className={inputClass}
          />
          <FieldError id="issueDate-error" message={e.issueDate} />
        </div>

        <div className="space-y-3">
          {rows.map((row, i) => {
            const sub = preview.subtotals[i];
            return (
              <div key={row.key} className="rounded-lg border border-slate-200 p-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_6rem_9rem_8rem_auto] sm:items-start">
                  <div>
                    <label htmlFor={`d-${row.key}`} className={labelClass}>
                      Concepto {i + 1}
                    </label>
                    <input
                      id={`d-${row.key}`}
                      name="itemDescription"
                      maxLength={200}
                      value={row.description}
                      onChange={(ev) => update(row.key, "description", ev.target.value)}
                      aria-invalid={!!e[`item-${i}-description`]}
                      className={inputClass}
                    />
                    <FieldError id={`d-${row.key}-error`} message={e[`item-${i}-description`]} />
                  </div>
                  <div>
                    <label htmlFor={`q-${row.key}`} className={labelClass}>
                      Cantidad
                    </label>
                    <input
                      id={`q-${row.key}`}
                      name="itemQuantity"
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(ev) => update(row.key, "quantity", ev.target.value)}
                      aria-invalid={!!e[`item-${i}-quantity`]}
                      className={`${inputClass} tabular`}
                    />
                    <FieldError id={`q-${row.key}-error`} message={e[`item-${i}-quantity`]} />
                  </div>
                  <div>
                    <label htmlFor={`p-${row.key}`} className={labelClass}>
                      Precio unitario
                    </label>
                    <input
                      id={`p-${row.key}`}
                      name="itemPrice"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={row.unitPrice}
                      onChange={(ev) => update(row.key, "unitPrice", ev.target.value)}
                      aria-invalid={!!e[`item-${i}-price`]}
                      className={`${inputClass} tabular`}
                    />
                    <FieldError id={`p-${row.key}-error`} message={e[`item-${i}-price`]} />
                  </div>
                  <div>
                    <span className={labelClass}>Subtotal</span>
                    <p className="tabular py-2.5 text-slate-800">{sub === null ? "—" : formatARS(sub)}</p>
                  </div>
                  <div className="sm:pt-6">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      disabled={rows.length === 1}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                      aria-label={`Quitar concepto ${i + 1}`}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          <FieldError id="items-error" message={e.items} />
          <button
            type="button"
            onClick={addRow}
            disabled={rows.length >= MAX_ROWS}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            + Agregar concepto
          </button>
        </div>

        <div className="flex items-baseline justify-end gap-3 border-t border-slate-200 pt-4">
          <span className="text-slate-600">Total estimado</span>
          <span className="tabular text-2xl font-semibold text-slate-900">{formatARS(preview.total)}</span>
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Link href={invoiceId ? `/facturas/${invoiceId}` : "/facturas"} className="text-center text-sm font-medium text-slate-600 hover:underline">
          Cancelar
        </Link>
        <SubmitButton pendingText="Guardando…">Guardar borrador y revisar</SubmitButton>
      </div>
    </form>
  );
}
