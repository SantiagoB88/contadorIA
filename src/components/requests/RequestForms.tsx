"use client";

import { useEffect, useRef, useState } from "react";
import { ActionForm, useActionForm } from "@/components/ActionForm";
import type { FormState } from "@/modules/admin/actions";
import { createRequestAction, informPaymentAction, replyAction, updateRequestAction } from "@/modules/requests/actions";
import { documentVisibilityAction, uploadDocumentsAction } from "@/modules/documents/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Feedback, FieldError } from "@/components/forms";
import { inputClass, labelClass } from "@/components/ui";

const MAX_MB = 10;
const MAX_FILES = 3;

function useForm(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  const [state, formAction] = useActionForm<FormState>(action, {});
  const v = state.ok ? {} : (state.values ?? {});
  const e = state.fieldErrors ?? {};
  return { state, formAction, v, e };
}

function errorProps(id: string, e: Record<string, string>) {
  return { "aria-invalid": !!e[id], "aria-describedby": e[id] ? `${id}-error` : undefined };
}

type Option = { value: string; label: string };

/**
 * Selector de archivos con textos en español (el botón nativo depende del idioma del navegador),
 * lista de lo elegido y aviso inmediato de tamaño. La validación que vale la hace el servidor.
 */
function FileField({ id, label, error, required }: { id: string; label: string; error?: string; required?: boolean }) {
  const [warning, setWarning] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cuando el formulario se envía bien, React lo vacía: la lista también.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setNames([]);
      setWarning(null);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div className="relative flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          id={id}
          name="files"
          type="file"
          multiple
          required={required}
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
          onChange={(ev) => {
            const files = Array.from(ev.currentTarget.files ?? []);
            setNames(files.map((f) => f.name));
            if (files.length > MAX_FILES) setWarning(`Elegiste ${files.length} archivos: el máximo es ${MAX_FILES}.`);
            else if (files.some((f) => f.size > MAX_MB * 1024 * 1024)) setWarning(`Hay un archivo de más de ${MAX_MB} MB.`);
            else setWarning(null);
          }}
          className="peer sr-only"
        />
        <label
          htmlFor={id}
          className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600"
        >
          {names.length ? "Cambiar archivos" : "Elegir archivos"}
        </label>
        <span className="min-w-0 text-sm text-slate-600">
          {names.length === 0 ? "Ningún archivo elegido" : names.length === 1 ? names[0] : `${names.length} archivos elegidos`}
        </span>
      </div>
      {names.length > 1 && (
        <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
          {names.map((n, i) => (
            <li key={`${n}-${i}`} className="truncate">
              · {n}
            </li>
          ))}
        </ul>
      )}
      <p id={`${id}-help`} className="mt-1 text-xs text-slate-500">
        PDF, PNG o JPG · hasta {MAX_MB} MB cada uno · máximo {MAX_FILES} archivos.
      </p>
      {warning && <p className="mt-1 text-sm text-amber-800">{warning}</p>}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function NewRequestForm({ taxpayers, selectedId, topics }: { taxpayers: Option[]; selectedId: string; topics: Option[] }) {
  const { state, formAction, v, e } = useForm(createRequestAction);
  return (
    <ActionForm form={formAction} className="space-y-4" noValidate>
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="taxpayerId" className={labelClass}>
            Contribuyente
          </label>
          <select id="taxpayerId" name="taxpayerId" defaultValue={v.taxpayerId ?? selectedId} {...errorProps("taxpayerId", e)} className={inputClass}>
            {taxpayers.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <FieldError id="taxpayerId-error" message={e.taxpayerId} />
        </div>
        <div>
          <label htmlFor="topic" className={labelClass}>
            Tema
          </label>
          <select id="topic" name="topic" defaultValue={v.topic ?? ""} {...errorProps("topic", e)} className={inputClass}>
            <option value="" disabled>
              Elegí un tema
            </option>
            {topics.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <FieldError id="topic-error" message={e.topic} />
        </div>
      </div>
      <div>
        <label htmlFor="subject" className={labelClass}>
          Asunto
        </label>
        <input id="subject" name="subject" maxLength={120} placeholder="Ej.: Necesito la constancia de inscripción" defaultValue={v.subject ?? ""} {...errorProps("subject", e)} className={inputClass} />
        <FieldError id="subject-error" message={e.subject} />
      </div>
      <div>
        <label htmlFor="body" className={labelClass}>
          Mensaje
        </label>
        <textarea id="body" name="body" rows={6} maxLength={4000} defaultValue={v.body ?? ""} {...errorProps("body", e)} className={inputClass} />
        <FieldError id="body-error" message={e.body} />
      </div>
      <FileField id="newFiles" label="Adjuntos (opcional)" error={e.files} />
      <SubmitButton pendingText="Enviando…">Enviar solicitud</SubmitButton>
    </ActionForm>
  );
}

export function ReplyForm({ requestId, staff, statuses }: { requestId: string; staff: boolean; statuses: Option[] }) {
  const { state, formAction, v, e } = useForm(replyAction);
  const [visibility, setVisibility] = useState(v.visibility ?? "PUBLICA");
  const internal = visibility === "INTERNA";

  return (
    <ActionForm form={formAction} resetOnSuccess className="space-y-4" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      <Feedback state={state} />
      {staff ? (
        <div>
          {/* El valor que se envía sale siempre del estado (campo oculto): lo que se ve marcado es lo que se guarda,
              también después de que React vacía el formulario al terminar un envío. */}
          <input type="hidden" name="visibility" value={visibility} />
          <p id="visibility-label" className={labelClass}>
            Tipo de mensaje
          </p>
          <div role="radiogroup" aria-labelledby="visibility-label" className="flex flex-wrap gap-2">
            {[
              { value: "PUBLICA", label: "Respuesta al cliente" },
              { value: "INTERNA", label: "Nota interna (el cliente no la ve)" },
            ].map((o) => {
              const selected = visibility === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setVisibility(o.value)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                    selected
                      ? o.value === "INTERNA"
                        ? "border-amber-400 bg-amber-50 font-medium text-amber-900"
                        : "border-brand-400 bg-brand-50 font-medium text-brand-900"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? "border-current" : "border-slate-400"}`}
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-current" />}
                  </span>
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <input type="hidden" name="visibility" value="PUBLICA" />
      )}
      <div>
        <label htmlFor="replyBody" className={labelClass}>
          {internal ? "Nota interna" : staff ? "Respuesta" : "Tu mensaje"}
        </label>
        <textarea
          id="replyBody"
          name="body"
          rows={5}
          maxLength={4000}
          defaultValue={v.body ?? ""}
          aria-invalid={!!e.body}
          aria-describedby={e.body ? "replyBody-error" : undefined}
          className={`${inputClass} ${internal ? "bg-amber-50" : ""}`}
        />
        <FieldError id="replyBody-error" message={e.body} />
      </div>
      {staff && (
        <div className="max-w-xs">
          <label htmlFor="newStatus" className={labelClass}>
            Cambiar estado (opcional)
          </label>
          <select id="newStatus" name="newStatus" defaultValue={v.newStatus ?? ""} {...errorProps("newStatus", e)} className={inputClass}>
            <option value="">Dejar como está</option>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <FieldError id="newStatus-error" message={e.newStatus} />
        </div>
      )}
      <FileField id="replyFiles" label={internal ? "Adjuntos internos (opcional)" : "Adjuntos (opcional)"} error={e.files} />
      <SubmitButton pendingText="Enviando…">{internal ? "Guardar nota interna" : "Enviar"}</SubmitButton>
    </ActionForm>
  );
}

export function RequestSettingsForm({
  requestId,
  status,
  priority,
  assignedToId,
  staff,
  statuses,
}: {
  requestId: string;
  status: string;
  priority: string;
  assignedToId: string;
  staff: Option[];
  statuses: Option[];
}) {
  const { state, formAction, v, e } = useForm(updateRequestAction);
  return (
    <ActionForm form={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      <Feedback state={state} />
      <div>
        <label htmlFor="srStatus" className={labelClass}>
          Estado
        </label>
        <select id="srStatus" name="status" defaultValue={v.status ?? status} className={inputClass}>
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <FieldError id="srStatus-error" message={e.status} />
      </div>
      <div>
        <label htmlFor="srAssigned" className={labelClass}>
          Asignada a
        </label>
        <select id="srAssigned" name="assignedToId" defaultValue={v.assignedToId ?? assignedToId} className={inputClass}>
          <option value="">Sin asignar</option>
          {staff.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <FieldError id="srAssigned-error" message={e.assignedToId} />
      </div>
      <div>
        <label htmlFor="srPriority" className={labelClass}>
          Prioridad
        </label>
        <select id="srPriority" name="priority" defaultValue={v.priority ?? priority} className={inputClass}>
          <option value="NORMAL">Normal</option>
          <option value="ALTA">Alta</option>
        </select>
      </div>
      <SubmitButton pendingText="Guardando…" className="w-full">
        Guardar
      </SubmitButton>
    </ActionForm>
  );
}

export function InformPaymentForm({ obligationId }: { obligationId: string }) {
  const { state, formAction, v, e } = useForm(informPaymentAction);
  return (
    <ActionForm form={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="obligationId" value={obligationId} />
      <Feedback state={state} />
      <FileField id="payFiles" label="Comprobante de pago" error={e.files} required />
      <div>
        <label htmlFor="payNote" className={labelClass}>
          Comentario (opcional)
        </label>
        <textarea
          id="payNote"
          name="note"
          rows={3}
          maxLength={1000}
          placeholder="Ej.: Pagué el 12/10 por home banking."
          defaultValue={v.note ?? ""}
          {...errorProps("note", e)}
          className={inputClass}
        />
        <FieldError id="note-error" message={e.note} />
      </div>
      <SubmitButton pendingText="Enviando…">Informar pago</SubmitButton>
    </ActionForm>
  );
}

export function DocumentUploadForm({ taxpayerId, categories }: { taxpayerId: string; categories: Option[] }) {
  const { state, formAction, v, e } = useForm(uploadDocumentsAction);
  return (
    <ActionForm form={formAction} resetOnSuccess className="space-y-4" noValidate>
      <input type="hidden" name="taxpayerId" value={taxpayerId} />
      <Feedback state={state} />
      <FileField id="docFiles" label="Archivos" error={e.files} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="docCategory" className={labelClass}>
            Categoría
          </label>
          <select id="docCategory" name="category" defaultValue={v.category ?? "CONSTANCIA"} {...errorProps("category", e)} className={inputClass}>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <FieldError id="category-error" message={e.category} />
        </div>
        <div>
          <label htmlFor="docVisibility" className={labelClass}>
            Quién lo ve
          </label>
          <select id="docVisibility" name="visibility" defaultValue={v.visibility ?? "CLIENTE"} {...errorProps("visibility", e)} className={inputClass}>
            <option value="CLIENTE">El cliente y el estudio</option>
            <option value="INTERNO">Solo el estudio (interno)</option>
          </select>
          <FieldError id="visibility-error" message={e.visibility} />
        </div>
      </div>
      <div>
        <label htmlFor="docNote" className={labelClass}>
          Nota (opcional)
        </label>
        <input id="docNote" name="note" maxLength={300} defaultValue={v.note ?? ""} {...errorProps("note", e)} className={inputClass} />
        <FieldError id="note-error" message={e.note} />
      </div>
      <SubmitButton pendingText="Subiendo…">Subir documentos</SubmitButton>
    </ActionForm>
  );
}

export function DocumentVisibilityButton({ documentId, visibility }: { documentId: string; visibility: string }) {
  const [state, formAction] = useActionForm<FormState>(documentVisibilityAction, {});
  const next = visibility === "CLIENTE" ? "INTERNO" : "CLIENTE";
  return (
    <ActionForm form={formAction} className="inline">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="visibility" value={next} />
      <button type="submit" className="text-sm font-medium text-brand-700 hover:underline">
        {next === "CLIENTE" ? "Compartir con el cliente" : "Dejar de compartir"}
      </button>
      {state.message && !state.ok && <span className="ml-2 text-xs text-red-700">{state.message}</span>}
    </ActionForm>
  );
}
