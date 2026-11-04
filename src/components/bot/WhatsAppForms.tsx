"use client";

import { ActionForm, useActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Feedback } from "@/components/forms";
import {
  adminUnlinkAction,
  confirmBotInviteAction,
  generateLinkCodeAction,
  unlinkMyWhatsAppAction,
  type LinkCodeState,
  type SimpleState,
} from "@/modules/bot/actions";

export function LinkCodeForm() {
  const [state, action] = useActionForm<LinkCodeState>(generateLinkCodeAction, {});
  return (
    <ActionForm form={action} className="space-y-3">
      {state.code ? (
        <div className="rounded-lg border border-accent/40 bg-soft px-4 py-3" role="status">
          <p className="text-sm text-slate-700">Mandale este código al WhatsApp del estudio:</p>
          <p className="tabular mt-1 text-3xl font-semibold tracking-[0.3em] text-navy" data-testid="link-code">
            {state.code}
          </p>
          <p className="mt-1 text-xs text-slate-600">{state.message}</p>
        </div>
      ) : (
        <Feedback state={state} />
      )}
      <SubmitButton pendingText="Generando…">{state.code ? "Generar otro código" : "Generar código"}</SubmitButton>
    </ActionForm>
  );
}

export function UnlinkMyWhatsAppForm() {
  const [state, action] = useActionForm<SimpleState>(unlinkMyWhatsAppAction, {});
  return (
    <ActionForm form={action} confirmMessage="¿Desvincular tu WhatsApp? Desde ese número no vas a poder consultar nada." className="space-y-2">
      <Feedback state={state} />
      <button type="submit" className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
        Desvincular WhatsApp
      </button>
    </ActionForm>
  );
}

export function AdminUnlinkForm({ linkId }: { linkId: string }) {
  const [state, action] = useActionForm<SimpleState>(adminUnlinkAction, {});
  return (
    <ActionForm form={action} confirmMessage="¿Desvincular el WhatsApp de este usuario?" className="inline">
      <input type="hidden" name="linkId" value={linkId} />
      <button type="submit" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
        Desvincular WhatsApp
      </button>
      {state.message && !state.ok && <span className="ml-2 text-xs text-red-700">{state.message}</span>}
    </ActionForm>
  );
}

export function ConfirmInviteForm({ token }: { token: string }) {
  const [state, action] = useActionForm<SimpleState>(confirmBotInviteAction, {});
  return (
    <ActionForm form={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Feedback state={state} />
      <SubmitButton pendingText="Vinculando…">Vincular este WhatsApp a mi cuenta</SubmitButton>
    </ActionForm>
  );
}
