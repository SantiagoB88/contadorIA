"use server";

import { demoAction } from "@/lib/demo-journal";
import { mailReachesPeople } from "@/lib/mail-status";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ROLES } from "@/lib/constants";
import { audit } from "@/lib/audit";
import { verifyPassword } from "@/lib/crypto";
import { getOrigin } from "@/lib/origin";
import { whatsappChatUrl } from "@/lib/whatsapp-public";
import { clearAttempts, createSession, isRateLimited, registerFailedAttempt } from "@/lib/auth";
import { findLoginCandidates, parseLoginIdentifier, sendVerificationEmail } from "@/modules/auth/service";
import { createWebLinkCode, WEB_CODE_MINUTES } from "@/modules/bot/links";
import { refreshDemoAccounts, restoreDemoAccounts } from "@/lib/demo-accounts";

/** `whatsapp`: la cuenta falta confirmar; se confirma mandando el código por WhatsApp (o con el enlace del correo). */
export type LoginState = {
  error?: string;
  info?: string;
  email?: string;
  whatsapp?: { code: string; url: string | null; minutes: number; mailSent: boolean };
};

const BAD_LOGIN = "Los datos de ingreso o la contraseña no son correctos.";

async function loginActionAccion(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const rawId = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const id = parseLoginIdentifier(rawId);
  if (!id || !password || password.length > 200) {
    return { error: "Ingresá tu correo, CUIT o DNI y tu contraseña.", email: rawId };
  }

  const key = `login:${id.value}`;
  if (isRateLimited(key)) {
    return { error: "Hubo demasiados intentos. Esperá unos minutos y volvé a probar.", email: rawId };
  }

  await restoreDemoAccounts(); // demo de Vercel: cuentas creadas en otra copia del servidor (ver demo-accounts.ts)
  // Por CUIT o DNI puede haber más de una cuenta: entra la única cuya contraseña coincide.
  const candidates = (await findLoginCandidates(id)).filter((u) => u.active);
  const passwordMatches = async (hash: string) =>
    // Al pegar una contraseña suelen venir espacios de más: si la exacta no coincide, se prueba sin ellos.
    (await verifyPassword(password, hash)) || (password.trim() !== password && (await verifyPassword(password.trim(), hash)));
  const matching = [];
  for (const u of candidates) if (await passwordMatches(u.passwordHash)) matching.push(u);
  const user = matching.length === 1 ? matching[0] : null;
  if (!user) {
    registerFailedAttempt(key);
    // Mensaje genérico: no revela si la cuenta existe.
    return { error: BAD_LOGIN, email: rawId };
  }

  clearAttempts(key);

  if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < new Date()) {
    return {
      error: "La contraseña temporal venció. Pedí una nueva al asistente de WhatsApp (Mi cuenta → Entrar a la web) o usá ¿Olvidaste tu contraseña?.",
      email: rawId,
    };
  }

  // La cuenta queda confirmada con el correo o con un WhatsApp vinculado (el número prueba que es suya).
  const phoneVerified = !user.emailVerifiedAt && (await prisma.channelLink.count({ where: { userId: user.id, status: "ACTIVO" } })) > 0;
  if (!user.emailVerifiedAt && !phoneVerified) {
    const mailSent = mailReachesPeople();
    if (mailSent) await sendVerificationEmail(user, await getOrigin());
    // Primero WhatsApp (es lo más rápido): un código de un solo uso que la persona le manda al asistente.
    if (user.role === "CLIENTE") {
      const { code } = await createWebLinkCode(user);
      return { email: rawId, whatsapp: { code, url: whatsappChatUrl(code), minutes: WEB_CODE_MINUTES, mailSent } };
    }
    return {
      info: mailSent
        ? "Todavía no confirmaste tu correo. Te enviamos un enlace nuevo: abrilo y volvé a ingresar."
        : "Todavía no confirmaste tu correo. Pedile a otro administrador del estudio que lo confirme en Accesos.",
      email: rawId,
    };
  }

  await createSession(user.id);
  await refreshDemoAccounts();
  await audit({ studyId: user.studyId, actorId: user.id, action: "LOGIN", entity: "User", entityId: user.id, detail: id.kind === "EMAIL" ? undefined : `Ingreso con ${id.kind}` });
  // Con contraseña temporal, lo primero es elegir una propia.
  // Sin página pedida, el estudio empieza en "Hoy en el estudio" y el cliente en su Inicio.
  const home = user.role === ROLES.ADMIN ? "/admin" : "/dashboard";
  redirect(user.mustChangePassword ? "/perfil?clave=temporal#clave" : safeNext(String(formData.get("next") ?? ""), home));
}

/** Vuelve a la página que pidió el ingreso, solo si es una ruta interna (nunca a otro sitio). */
function safeNext(next: string, home: string): string {
  return /^\/(?!\/)[\w\-./?=&%]*$/.test(next) && !next.startsWith("/login") ? next : home;
}

// Demo de Vercel: cada acción reconstruye y guarda los datos de la demo en el navegador (ver demo-journal.ts).
export const loginAction = demoAction(loginActionAccion);
