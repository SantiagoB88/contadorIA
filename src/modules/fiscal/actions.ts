"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { CATEGORY_CODES } from "@/lib/constants";
import type { FormState } from "@/modules/admin/actions";
import { createScaleVersion, updateScaleVersion, type ScaleInput } from "./scales";
import { setCategory } from "./category";
import { createObligation, recordDebtReview, updateObligationStatus } from "./obligations";

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "");

function refreshAll() {
  // Una escala o una categoría cambian los indicadores de todo el estudio.
  revalidatePath("/dashboard", "layout");
  revalidatePath("/admin", "layout");
}

function readScale(formData: FormData): { input: ScaleInput; values: Record<string, string> } {
  const limits: Record<string, string> = {};
  for (const code of CATEGORY_CODES) limits[code] = str(formData, `limit-${code}`);
  const input: ScaleInput = {
    name: str(formData, "name"),
    source: str(formData, "source"),
    status: str(formData, "status"),
    validFrom: str(formData, "validFrom"),
    validTo: str(formData, "validTo"),
    limits,
  };
  const values: Record<string, string> = {
    name: input.name,
    source: input.source,
    status: input.status,
    validFrom: input.validFrom,
    validTo: input.validTo,
    reason: str(formData, "reason"),
  };
  for (const code of CATEGORY_CODES) values[`limit-${code}`] = limits[code];
  return { input, values };
}

export async function createScaleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { input, values } = readScale(formData);
  const result = await createScaleVersion(admin, input);
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, values };
  refreshAll();
  redirect(`/admin/escalas/${result.scaleId}?creada=1`);
}

export async function updateScaleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { input, values } = readScale(formData);
  const result = await updateScaleVersion(admin, str(formData, "scaleId"), input, str(formData, "reason"));
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, values };
  refreshAll();
  return { ok: true, message: result.message };
}

export async function setCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const values = { categoryCode: str(formData, "categoryCode"), validFrom: str(formData, "validFrom"), reason: str(formData, "reason") };
  const result = await setCategory(admin, str(formData, "taxpayerId"), values.categoryCode, values.validFrom, values.reason);
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, values };
  refreshAll();
  return { ok: true, message: result.message };
}

export async function createObligationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const values = {
    concept: str(formData, "concept"),
    period: str(formData, "period"),
    dueDate: str(formData, "dueDate"),
    amount: str(formData, "amount"),
  };
  const result = await createObligation(admin, str(formData, "taxpayerId"), values);
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, values };
  refreshAll();
  return { ok: true, message: result.message };
}

export async function updateObligationStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const values = { status: str(formData, "status"), note: str(formData, "note") };
  const result = await updateObligationStatus(admin, str(formData, "obligationId"), values.status, values.note);
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, values };
  refreshAll();
  return { ok: true, message: result.message };
}

export async function debtReviewAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const values = { asOfDate: str(formData, "asOfDate"), reviewStatus: str(formData, "reviewStatus"), reviewNote: str(formData, "reviewNote") };
  const result = await recordDebtReview(admin, str(formData, "taxpayerId"), values.asOfDate, values.reviewStatus, values.reviewNote);
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, values };
  refreshAll();
  return { ok: true, message: result.message };
}
