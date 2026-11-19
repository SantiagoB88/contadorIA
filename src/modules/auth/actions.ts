"use server";

import { demoAction } from "@/lib/demo-journal";
import { mailReachesPeople } from "@/lib/mail-status";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrigin } from "@/lib/origin";
import { passwordProblem } from "@/lib/crypto";
import { isRateLimited, registerFailedAttempt, requireUser } from "@/lib/auth";
import { registerUser, requestPasswordReset, resetPassword, sendVerificationEmail, verifyEmail } from "./service";
import { prisma } from "@/lib/db";
import { refreshDemoAccounts, rememberDemoAccountByEmail, restoreDemoAccounts } from "@/lib/demo-accounts";

export type AuthFormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const registerSchema = z.object({
  name: z.string().trim().min(2, "Ingresá tu nombre (mínimo 2 caracteres).").max(120, "Máximo 120 caracteres."),
  email: z.string().trim().toLowerCase().max(200).email("Ingresá un correo válido."),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s()-]{8,20}$/, "Ingresá un teléfono válido, por ejemplo +54 11 5555-5555."),
});

async function registerActionAccion(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  };
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const fieldErrors: Record<string, string> = {};
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
  }
  const pwProblem = passwordProblem(password);
  if (pwProblem) fieldErrors.password = pwProblem;
  else if (password !== confirm) fieldErrors.confirm = "Las contraseñas no coinciden.";

  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Revisá los campos marcados.", fieldErrors, values: raw };
  }

  const key = `registro:${parsed.data.email}`;
  if (isRateLimited(key)) return { ok: false, message: "Hubo demasiados intentos. Probá en unos minutos.", values: raw };
  registerFailedAttempt(key); // cuenta intentos, exitosos o no

  const result = await registerUser({ ...parsed.data, password }, await getOrigin());
  if (!result.ok) return { ok: false, message: result.error, values: raw };
  await rememberDemoAccountByEmail(parsed.data.email); // demo de Vercel: la cuenta sigue al navegador
  return {
    ok: true,
    message: mailReachesPeople()
      ? `Listo. Para activar la cuenta, ingresá con tu correo y contraseña: te vamos a dar un código para mandar por WhatsApp (es lo más rápido). También te enviamos un enlace a ${parsed.data.email}.`
      : `Listo. Para activar la cuenta, ingresá con tu correo y contraseña: te vamos a dar un código para mandar por WhatsApp.`,
  };
}

async function verifyEmailActionAccion(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  await restoreDemoAccounts(); // demo de Vercel: el enlace puede ser de otra copia del servidor
  const ok = await verifyEmail(String(formData.get("token") ?? ""));
  if (ok) await refreshDemoAccounts();
  return ok
    ? { ok: true, message: "Tu correo quedó confirmado. Ya podés ingresar." }
    : { ok: false, message: "El enlace no es válido, ya se usó o venció. Ingresá con tu correo y contraseña para recibir uno nuevo." };
}

async function requestResetActionAccion(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    return { ok: false, message: "Ingresá un correo válido.", values: { email } };
  }
  const key = `recuperar:${email}`;
  if (!isRateLimited(key)) {
    registerFailedAttempt(key);
    await restoreDemoAccounts();
    await requestPasswordReset(email, await getOrigin());
    await rememberDemoAccountByEmail(email);
  }
  // Mismo mensaje siempre: no revela si el correo tiene cuenta.
  return {
    ok: true,
    message: "Si el correo tiene una cuenta, te enviamos un enlace para restablecer la contraseña. Vence en 1 hora.",
  };
}

async function resetPasswordActionAccion(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const problem = passwordProblem(password);
  if (problem) return { ok: false, message: "Revisá los campos marcados.", fieldErrors: { password: problem } };
  if (password !== confirm) {
    return { ok: false, message: "Revisá los campos marcados.", fieldErrors: { confirm: "Las contraseñas no coinciden." } };
  }

  await restoreDemoAccounts();
  const ok = await resetPassword(token, password);
  if (!ok) return { ok: false, message: "El enlace no es válido, ya se usó o venció. Pedí uno nuevo." };
  await refreshDemoAccounts();
  // El enlace ya se usó: se sigue en Ingresar, con el aviso (si se quedara acá, la pantalla diría "enlace no válido").
  redirect("/login?aviso=clave-cambiada");
}

// Demo de Vercel: cada acción reconstruye y guarda los datos de la demo en el navegador (ver demo-journal.ts).
export const registerAction = demoAction(registerActionAccion);
export const verifyEmailAction = demoAction(verifyEmailActionAccion);
export const requestResetAction = demoAction(requestResetActionAccion);
export const resetPasswordAction = demoAction(resetPasswordActionAccion);

/** Ya adentro (confirmó por WhatsApp): reenvía el enlace para confirmar también el correo. */
async function resendVerificationActionAccion(_prev: AuthFormState): Promise<AuthFormState> {
  const user = await requireUser();
  const key = `reenviar:${user.id}`;
  if (isRateLimited(key)) return { ok: false, message: "Ya te mandamos varios. Esperá unos minutos y revisá también la carpeta de spam." };
  registerFailedAttempt(key);
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerifiedAt: true } });
  if (row?.emailVerifiedAt) return { ok: true, message: "Tu correo ya está confirmado." };
  await sendVerificationEmail(user, await getOrigin());
  return { ok: true, message: `Listo: te mandamos el enlace a ${user.email}. Revisá también la carpeta de spam.` };
}

export const resendVerificationAction = demoAction(resendVerificationActionAccion);
