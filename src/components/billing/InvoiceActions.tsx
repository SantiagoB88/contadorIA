"use client";

import { useActionState } from "react";
import { deleteDraftAction, duplicateAction, emitInvoiceAction, type SimpleState } from "@/modules/billing/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Feedback } from "@/components/forms";

/**
 * Confirmación de la emisión. La clave de idempotencia viene del servidor al dibujar la página:
 * un doble clic o un reintento mandan la misma clave y no se duplica el comprobante.
 */
export function EmitPanel({ invoiceId, idempotencyKey, isDemo }: { invoiceId: string; idempotencyKey: string; isDemo: boolean }) {
  const [state, action] = useActionState<SimpleState, FormData>(emitInvoiceAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <Feedback state={state} />
      {isDemo && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="simulateRejection" className="mt-0.5 h-4 w-4 accent-brand-600" />
          <span>Simular un rechazo (para probar ese caso; no suma en los totales)</span>
        </label>
      )}
      <SubmitButton pendingText="Emitiendo…" className="w-full sm:w-auto">
        Confirmar emisión simulada
      </SubmitButton>
    </form>
  );
}

export function DeleteDraftButton({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState<SimpleState, FormData>(deleteDraftAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("¿Eliminar este borrador? No se puede deshacer.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {state.message && <p className="mb-2 text-sm text-red-700">{state.message}</p>}
      <button type="submit" className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50">
        Eliminar borrador
      </button>
    </form>
  );
}

export function DuplicateButton({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState<SimpleState, FormData>(duplicateAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {state.message && <p className="mb-2 text-sm text-red-700">{state.message}</p>}
      <button
        type="submit"
        className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        Crear borrador a partir de esta
      </button>
    </form>
  );
}
