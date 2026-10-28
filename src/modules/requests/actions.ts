"use server";

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

export async function createRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = { taxpayerId: str(formData, "taxpayerId"), topic: str(formData, "topic"), subject: str(formData, "subject"), body: str(formData, "body") };
  const result = await createRequest(user, values, await readUploads(formData), await getOrigin());
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, values };
  refresh();
  redirect(`/solicitudes/${result.requestId}?enviada=1`);
}

export async function replyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
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

export async function updateRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const requestId = str(formData, "requestId");
  const values = { status: str(formData, "status"), priority: str(formData, "priority"), assignedToId: str(formData, "assignedToId") };
  const result = await updateRequest(admin, requestId, values, await getOrigin());
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, values };
  refresh(requestId);
  return { ok: true, message: result.message };
}

export async function informPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = { note: str(formData, "note") };
  const result = await informPayment(user, str(formData, "obligationId"), values.note, await readUploads(formData), await getOrigin());
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, values };
  refresh();
  redirect(`/solicitudes/${result.requestId}?pago=1`);
}
