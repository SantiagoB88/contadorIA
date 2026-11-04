"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { formatDateTimeAR } from "@/lib/dates";
import { consumeBotInvite, createWebLinkCode, getUserLink, unlinkChannel, WEB_CODE_MINUTES } from "./links";

export type LinkCodeState = { ok?: boolean; message?: string; code?: string; expires?: string };

/** Mi perfil → WhatsApp: genera un código de un solo uso para mandar al bot. */
export async function generateLinkCodeAction(_prev: LinkCodeState, _formData: FormData): Promise<LinkCodeState> {
  const user = await requireUser();
  if (user.role !== "CLIENTE") return { ok: false, message: "Solo las cuentas de clientes se pueden vincular a WhatsApp." };
  const { code, expiresAt } = await createWebLinkCode(user);
  return { ok: true, code, expires: formatDateTimeAR(expiresAt), message: `Vence en ${WEB_CODE_MINUTES} minutos y sirve una sola vez.` };
}

export type SimpleState = { ok?: boolean; message?: string };

/** El usuario desvincula su propio WhatsApp. */
export async function unlinkMyWhatsAppAction(_prev: SimpleState, _formData: FormData): Promise<SimpleState> {
  const user = await requireUser();
  const link = await getUserLink(user.id);
  if (!link) return { ok: false, message: "No tenés un WhatsApp vinculado." };
  const result = await unlinkChannel(user, link.id, "Desvinculado por el usuario");
  revalidatePath("/perfil");
  return result;
}

/** El estudio desvincula el WhatsApp de un usuario. */
export async function adminUnlinkAction(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const admin = await requireAdmin();
  const result = await unlinkChannel(admin, String(formData.get("linkId") ?? ""), "Desvinculado por el estudio");
  revalidatePath("/admin/accesos");
  return result;
}

/** El usuario logueado confirma el enlace que le mandó el bot. */
export async function confirmBotInviteAction(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const user = await requireUser();
  const result = await consumeBotInvite(user, String(formData.get("token") ?? ""));
  if (!result.ok) return result;
  revalidatePath("/perfil");
  redirect("/perfil?whatsapp=vinculado");
}
