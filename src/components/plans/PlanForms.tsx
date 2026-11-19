"use client";

import { ActionForm, useActionForm } from "@/components/ActionForm";
import { assignPlanAction, deletePlanAction, savePlanAction, type PlanFormState } from "@/modules/plans/actions";
import { MODULE_KEYS, MODULES, type ModuleKey } from "@/modules/plans/catalog";
import { SubmitButton } from "@/components/SubmitButton";
import { Feedback, FieldError } from "@/components/forms";
import { inputClass, labelClass } from "@/components/ui";

type PlanValues = { id?: string; name: string; description: string; modules: ModuleKey[]; isDefault: boolean };

/** Crear o editar un plan: nombre, descripción, módulos que incluye y si es el plan por defecto. */
export function PlanForm({ plan }: { plan?: PlanValues }) {
  const [state, action] = useActionForm<PlanFormState>(savePlanAction, {});
  const e = state.fieldErrors ?? {};
  const prefix = plan?.id ?? "nuevo";
  return (
    <ActionForm form={action} resetOnSuccess={!plan} className="space-y-4">
      {plan?.id && <input type="hidden" name="planId" value={plan.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${prefix}-name`} className={labelClass}>
            Nombre del plan
          </label>
          <input
            id={`${prefix}-name`}
            name="name"
            defaultValue={plan?.name ?? ""}
            maxLength={60}
            required
            placeholder="Por ejemplo: Básico"
            aria-invalid={!!e.name}
            className={inputClass}
          />
          <FieldError id={`${prefix}-name-error`} message={e.name} />
        </div>
        <div>
          <label htmlFor={`${prefix}-description`} className={labelClass}>
            Descripción <span className="font-normal text-slate-500">(opcional, la ve el cliente)</span>
          </label>
          <input
            id={`${prefix}-description`}
            name="description"
            defaultValue={plan?.description ?? ""}
            maxLength={300}
            placeholder="Qué incluye, en pocas palabras"
            aria-invalid={!!e.description}
            className={inputClass}
          />
          <FieldError id={`${prefix}-description-error`} message={e.description} />
        </div>
      </div>
      <fieldset>
        <legend className={labelClass}>Módulos que incluye</legend>
        <p className="mb-2 text-xs text-slate-500">Inicio y Mi perfil están siempre. El estudio ve todo, sin importar el plan.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODULE_KEYS.map((key) => (
            <label key={key} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
              <input
                type="checkbox"
                name="modules"
                value={key}
                defaultChecked={plan ? plan.modules.includes(key) : true}
                className="mt-0.5 h-4 w-4 accent-brand-600"
              />
              <span>
                <span className="font-medium text-navy">{MODULES[key].label}</span>
                <span className="block text-xs text-slate-500">{MODULES[key].desc}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldError id={`${prefix}-modules-error`} message={e.modules} />
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="isDefault" defaultChecked={plan?.isDefault ?? false} className="mt-0.5 h-4 w-4 accent-brand-600" />
        <span>
          <span className="font-medium text-navy">Plan por defecto</span>
          <span className="block text-xs text-slate-500">Lo usan los clientes que no tienen un plan asignado (también los nuevos).</span>
        </span>
      </label>
      <Feedback state={state} />
      <SubmitButton pendingText="Guardando…">{plan?.id ? "Guardar cambios" : "Crear plan"}</SubmitButton>
    </ActionForm>
  );
}

export function DeletePlanForm({ planId, name }: { planId: string; name: string }) {
  const [state, action] = useActionForm<PlanFormState>(deletePlanAction, {});
  return (
    <ActionForm form={action} confirmMessage={`¿Borrar el plan "${name}"?`} className="flex flex-col items-start gap-1">
      <input type="hidden" name="planId" value={planId} />
      <button type="submit" className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
        Borrar plan
      </button>
      {state.message && <p className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
    </ActionForm>
  );
}

/** Selector de plan de un cliente (en Accesos → Usuarios). */
export function AssignPlanForm({
  userId,
  name,
  current,
  plans,
  defaultName,
}: {
  userId: string;
  name: string;
  current: string | null;
  plans: { id: string; name: string }[];
  defaultName: string | null;
}) {
  const [state, action] = useActionForm<PlanFormState>(assignPlanAction, {});
  const id = `plan-${userId}`;
  return (
    <ActionForm form={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="sr-only">
          Plan de {name}
        </label>
        <select id={id} name="planId" defaultValue={current ?? ""} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <option value="">{defaultName ? `Por defecto (${defaultName})` : "Por defecto (todo)"}</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <SubmitButton pendingText="…" className="px-3 py-1.5 text-sm">
          Asignar plan
        </SubmitButton>
      </div>
      {state.message && <p className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
    </ActionForm>
  );
}
