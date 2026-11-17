"use server";

import { demoAction } from "@/lib/demo-journal";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { readUploads } from "@/lib/uploads";
import type { FormState } from "@/modules/admin/actions";
import { setDocumentVisibility, uploadTaxpayerDocuments } from "./service";

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "");

async function uploadDocumentsActionAccion(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const taxpayerId = str(formData, "taxpayerId");
  const values = { category: str(formData, "category"), visibility: str(formData, "visibility"), note: str(formData, "note") };
  const result = await uploadTaxpayerDocuments(admin, taxpayerId, await readUploads(formData), values);
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, values };
  revalidatePath(`/admin/contribuyentes/${taxpayerId}`);
  revalidatePath("/documentos");
  return { ok: true, message: result.message };
}

async function documentVisibilityActionAccion(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const result = await setDocumentVisibility(admin, str(formData, "documentId"), str(formData, "visibility"));
  revalidatePath("/admin", "layout");
  revalidatePath("/documentos");
  return { ok: result.ok, message: result.message };
}

// Demo de Vercel: cada acción reconstruye y guarda los datos de la demo en el navegador (ver demo-journal.ts).
export const uploadDocumentsAction = demoAction(uploadDocumentsActionAccion);
export const documentVisibilityAction = demoAction(documentVisibilityActionAccion);
