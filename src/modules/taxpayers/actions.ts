"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { setStartDate } from "./start-date";

export type StartDateState = { ok?: boolean; message?: string; fieldErrors?: Record<string, string>; value?: string };

export async function setStartDateAction(_prev: StartDateState, formData: FormData): Promise<StartDateState> {
  const user = await requireUser();
  const taxpayerId = String(formData.get("taxpayerId") ?? "");
  const value = String(formData.get("startDate") ?? "");
  const result = await setStartDate(user, taxpayerId, value);
  if (!result.ok) return { ...result, value };
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  revalidatePath("/perfil");
  // El aviso con el formulario desaparece al guardar: se vuelve a la misma pantalla con la confirmación arriba.
  // Solo dos destinos posibles (nunca una dirección que venga del navegador).
  const id = encodeURIComponent(taxpayerId);
  redirect(formData.get("from") === "admin" ? `/admin/contribuyentes/${id}?inicio=guardado` : `/dashboard?c=${id}&inicio=guardado`);
}
