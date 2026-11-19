"use server";

import { hasModule, notInPlan } from "@/modules/plans/service";
import { demoAction } from "@/lib/demo-journal";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  deleteDraft,
  duplicateAsDraft,
  emitInvoice,
  MAX_ITEMS,
  saveDraft,
  type DraftInput,
} from "./service";

export type DraftFormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: DraftInput;
};

export type SimpleState = { ok?: boolean; message?: string };

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "");

function readDraft(formData: FormData): DraftInput {
  const descriptions = formData.getAll("itemDescription").map(String);
  const quantities = formData.getAll("itemQuantity").map(String);
  const prices = formData.getAll("itemPrice").map(String);
  const count = Math.min(Math.max(descriptions.length, quantities.length, prices.length), MAX_ITEMS + 1);
  return {
    issueDate: str(formData, "issueDate"),
    recipientMode: str(formData, "recipientMode") === "existente" ? "existente" : "nuevo",
    recipientId: str(formData, "recipientId"),
    recipientName: str(formData, "recipientName"),
    docType: str(formData, "docType"),
    docNumber: str(formData, "docNumber"),
    taxCondition: str(formData, "taxCondition"),
    saveRecipient: formData.get("saveRecipient") === "on",
    recipientAlias: str(formData, "recipientAlias"),
    items: Array.from({ length: count }, (_, i) => ({
      description: descriptions[i] ?? "",
      quantity: quantities[i] ?? "",
      unitPrice: prices[i] ?? "",
    })),
  };
}

function refresh() {
  revalidatePath("/facturas");
  revalidatePath("/dashboard");
}

async function saveDraftActionAccion(_prev: DraftFormState, formData: FormData): Promise<DraftFormState> {
  const user = await requireUser();
  if (!(await hasModule(user, "FACTURACION"))) return { ok: false, message: notInPlan("FACTURACION") };
  const input = readDraft(formData);
  const invoiceId = str(formData, "invoiceId") || undefined;
  const result = await saveDraft(user, str(formData, "taxpayerId"), input, invoiceId);
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, values: input };
  refresh();
  redirect(`/facturas/${result.invoiceId}`);
}

async function emitInvoiceActionAccion(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const user = await requireUser();
  if (!(await hasModule(user, "FACTURACION"))) return { ok: false, message: notInPlan("FACTURACION") };
  const invoiceId = str(formData, "invoiceId");
  const result = await emitInvoice(user, invoiceId, str(formData, "idempotencyKey"), formData.get("simulateRejection") === "on");
  refresh();
  revalidatePath(`/facturas/${invoiceId}`);
  return { ok: result.ok, message: result.message };
}

async function deleteDraftActionAccion(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const user = await requireUser();
  if (!(await hasModule(user, "FACTURACION"))) return { ok: false, message: notInPlan("FACTURACION") };
  const result = await deleteDraft(user, str(formData, "invoiceId"));
  if (!result.ok) return result;
  refresh();
  redirect("/facturas");
}

async function duplicateActionAccion(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const user = await requireUser();
  if (!(await hasModule(user, "FACTURACION"))) return { ok: false, message: notInPlan("FACTURACION") };
  const result = await duplicateAsDraft(user, str(formData, "invoiceId"));
  if (!result.ok) return result;
  refresh();
  redirect(`/facturas/${result.invoiceId}/editar`);
}

// Demo de Vercel: cada acción reconstruye y guarda los datos de la demo en el navegador (ver demo-journal.ts).
export const saveDraftAction = demoAction(saveDraftActionAccion);
export const emitInvoiceAction = demoAction(emitInvoiceActionAccion);
export const deleteDraftAction = demoAction(deleteDraftActionAccion);
export const duplicateAction = demoAction(duplicateActionAccion);
