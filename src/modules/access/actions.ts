"use server";

import { rememberDemoAccount } from "@/lib/demo-accounts";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession, requireAdmin, requireUser } from "@/lib/auth";
import { changePassword, updateProfile } from "@/modules/profile/service";
import { approveRequest, rejectRequest, requestAssociation, revokeAccess, setUserActive } from "./service";

export type ActionState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "");

function refreshAll() {
  revalidatePath("/dashboard");
  revalidatePath("/perfil");
  revalidatePath("/admin");
  revalidatePath("/admin/accesos");
}

// ---- Cliente ----

export async function requestAssociationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const values = {
    cuit: str(formData, "cuit"),
    name: str(formData, "name"),
    activity: str(formData, "activity"),
    category: str(formData, "category"),
    startDate: str(formData, "startDate"),
  };
  const result = await requestAssociation(user, values);
  if (result.ok) {
    refreshAll();
    await rememberDemoAccount(user.id, true);
  }
  return result.ok ? result : { ...result, values };
}

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const values = { name: str(formData, "name"), phone: str(formData, "phone") };
  const result = await updateProfile(user, values.name, values.phone);
  if (result.ok) refreshAll();
  return result.ok ? result : { ...result, values };
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const result = await changePassword(user, str(formData, "current"), str(formData, "next"), str(formData, "confirm"));
  // Se cerraron todas las sesiones: se abre una nueva para quien hizo el cambio.
  if (result.ok) {
    await createSession(user.id);
    await rememberDemoAccount(user.id, true);
  }
  return result;
}

// ---- Administrador ----

// Demo de Vercel: si la cuenta revisada se creó en esta demo, se actualiza su copia guardada en el navegador.
async function rememberReviewed(requestId: string) {
  const request = await prisma.accessRequest.findUnique({ where: { id: requestId }, select: { userId: true } });
  if (request) await rememberDemoAccount(request.userId, true);
}

export async function approveRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const result = await approveRequest(admin, str(formData, "requestId"), str(formData, "category"), str(formData, "note"));
  if (!result.ok) return result;
  await rememberReviewed(str(formData, "requestId"));
  refreshAll();
  // La tarjeta de la solicitud desaparece al aprobarla: el aviso se muestra arriba de la página.
  redirect("/admin/accesos?aviso=aprobada");
}

export async function rejectRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const result = await rejectRequest(admin, str(formData, "requestId"), str(formData, "note"));
  if (!result.ok) return { ...result, values: { note: str(formData, "note") } };
  await rememberReviewed(str(formData, "requestId"));
  refreshAll();
  redirect("/admin/accesos?aviso=rechazada");
}

export async function revokeAccessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const result = await revokeAccess(admin, str(formData, "accessId"), str(formData, "reason"));
  if (!result.ok) return { ...result, values: { reason: str(formData, "reason") } };
  const access = await prisma.taxpayerAccess.findUnique({ where: { id: str(formData, "accessId") }, select: { userId: true } });
  if (access) await rememberDemoAccount(access.userId, true);
  refreshAll();
  redirect("/admin/accesos?aviso=revocado");
}

export async function setUserActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const result = await setUserActive(admin, str(formData, "userId"), str(formData, "active") === "true");
  if (result.ok) refreshAll();
  return result;
}
