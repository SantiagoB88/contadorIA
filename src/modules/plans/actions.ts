"use server";

import { demoAction } from "@/lib/demo-journal";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { assignPlan, deletePlan, savePlan } from "./service";

export type PlanFormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "");

function refresh() {
  revalidatePath("/admin/planes");
  revalidatePath("/admin/accesos");
  revalidatePath("/", "layout"); // el menú de los clientes depende del plan
}

async function savePlanActionAccion(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const admin = await requireAdmin();
  const result = await savePlan(admin, {
    id: str(formData, "planId") || undefined,
    name: str(formData, "name"),
    description: str(formData, "description"),
    modules: formData.getAll("modules").map(String),
    isDefault: formData.get("isDefault") === "on",
  });
  if (result.ok) refresh();
  return result;
}

async function deletePlanActionAccion(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const admin = await requireAdmin();
  const result = await deletePlan(admin, str(formData, "planId"));
  if (result.ok) refresh();
  return result;
}

async function assignPlanActionAccion(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const admin = await requireAdmin();
  const result = await assignPlan(admin, str(formData, "userId"), str(formData, "planId") || null);
  if (result.ok) refresh();
  return result;
}

// Demo de Vercel: cada acción reconstruye y guarda los datos de la demo en el navegador (ver demo-journal.ts).
export const savePlanAction = demoAction(savePlanActionAccion);
export const deletePlanAction = demoAction(deletePlanActionAccion);
export const assignPlanAction = demoAction(assignPlanActionAccion);
