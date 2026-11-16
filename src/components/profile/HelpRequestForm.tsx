"use client";

import { ActionForm, useActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Feedback } from "@/components/forms";
import { inputClass, labelClass } from "@/components/ui";
import { requestHelpAction, type HelpState } from "@/modules/profile/setup-actions";

/** "Necesito ayuda / Solicitar una llamada": crea (una sola vez) un pedido que el estudio ve en la Bandeja. */
export function HelpRequestForm({ reasons }: { reasons: Record<string, string> }) {
  const [state, action] = useActionForm<HelpState>(requestHelpAction, {});
  return (
    <ActionForm form={action} className="space-y-3">
      <Feedback state={state} />
      <div className="max-w-sm">
        <label htmlFor="help-reason" className={labelClass}>
          ¿Con qué necesitás ayuda?
        </label>
        <select id="help-reason" name="reason" defaultValue="CUENTA" className={inputClass}>
          {Object.entries(reasons).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton pendingText="Enviando…">Solicitar una llamada</SubmitButton>
    </ActionForm>
  );
}
