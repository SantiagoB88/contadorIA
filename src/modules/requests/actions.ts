"use server";

import { hasModule, notInPlan } from "@/modules/plans/service";
import { demoAction } from "@/lib/demo-journal";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { getOrigin } from "@/lib/origin";
import { readUploads } from "@/lib/uploads";
import type { FormState } from "@/modules/admin/actions";
import { addMessage, createRequest, informPayment, updateRequest } from "./service";

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "");

function refresh(requestId?: string) {
  revalidatePath("/solicitudes", "layout");
  revalidatePath("/admin/solicitudes", "layout");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/documentos");
  if (requestId) revalidatePath(`/solicitudes/${requestId}`);
}

async function createRequestActionAccion(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(await hasModule(user, "SOLICITUDES"))) return { ok: false, message: notInPlan("SOLICITUDES") };
  const values = { taxpayerId: str(formData, "taxpayerId"), topic: str(formData, "topic"), subject: str(formData, "subject"), body: str(formData, "body") };
  const result = await createRequest(user, values, await readUploads(formData), await getOrigin());
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, values };
  refresh();
  redirect(`/solicitudes/${result.requestId}?enviada=1`);
}

async function replyActionAccion(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(await hasModule(user, "SOLICITUDES"))) return { ok: false, message: notInPlan("SOLICITUDES") };
  const requestId = str(formData, "requestId");
  const values = { body: str(formData, "body"), visibility: str(formData, "visibility") || "PUBLICA", newStatus: str(formData, "newStatus") };
  const result = await addMessage(
    user,
    requestId,
    { body: values.body, visibility: values.visibility, newStatus: values.newStatus || undefined },
    await readUploads(formData),
    await getOrigin(),
  );
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, values };
  refresh(requestId);
  return { ok: true, message: result.message };
}

async function updateRequestActionAccion(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const requestId = str(formData, "requestId");
  const values = { status: str(formData, "status"), priority: str(formData, "priority"), assignedToId: str(formData, "assignedToId") };
  const result = await updateRequest(admin, requestId, values, await getOrigin());
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, values };
  refresh(requestId);
  return { ok: true, message: result.message };
}

async function informPaymentActionAccion(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(await hasModule(user, "DEUDAS"))) return { ok: false, message: notInPlan("DEUDAS") };
  const values = { note: str(formData, "note") };
  const result = await informPayment(user, str(formData, "obligationId"), values.note, await readUploads(formData), await getOrigin());
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, values };
  refresh();
  redirect(`/solicitudes/${result.requestId}?pago=1`);
}

// Demo de Vercel: cada acción reconstruye y guarda los datos de la demo en el navegador (ver demo-journal.ts).
export const createRequestAction = demoAction(createRequestActionAccion);
export const replyAction = demoAction(replyActionAccion);
export const updateRequestAction = demoAction(updateRequestActionAccion);
export const informPaymentAction = demoAction(informPaymentActionAccion);
