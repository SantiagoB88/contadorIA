"use server";

import { z } from "zod";
import { getOrigin } from "@/lib/origin";
import { passwordProblem } from "@/lib/crypto";
import { isRateLimited, registerFailedAttempt } from "@/lib/auth";
import { registerUser, requestPasswordReset, resetPassword, verifyEmail } from "./service";

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

export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
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
  return {
    ok: true,
    message: `Listo. Te enviamos un correo a ${parsed.data.email} para confirmar la cuenta. Abrí el enlace y después ingresá.`,
  };
}

export async function verifyEmailAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const ok = await verifyEmail(String(formData.get("token") ?? ""));
  return ok
    ? { ok: true, message: "Tu correo quedó confirmado. Ya podés ingresar." }
    : { ok: false, message: "El enlace no es válido, ya se usó o venció. Ingresá con tu correo y contraseña para recibir uno nuevo." };
}

export async function requestResetAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    return { ok: false, message: "Ingresá un correo válido.", values: { email } };
  }
  const key = `recuperar:${email}`;
  if (!isRateLimited(key)) {
    registerFailedAttempt(key);
    await requestPasswordReset(email, await getOrigin());
  }
  // Mismo mensaje siempre: no revela si el correo tiene cuenta.
  return {
    ok: true,
    message: "Si el correo tiene una cuenta, te enviamos un enlace para restablecer la contraseña. Vence en 1 hora.",
  };
}

export async function resetPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const problem = passwordProblem(password);
  if (problem) return { ok: false, message: "Revisá los campos marcados.", fieldErrors: { password: problem } };
  if (password !== confirm) {
    return { ok: false, message: "Revisá los campos marcados.", fieldErrors: { confirm: "Las contraseñas no coinciden." } };
  }

  const ok = await resetPassword(token, password);
  return ok
    ? { ok: true, message: "Listo, tu contraseña cambió. Cerramos las sesiones abiertas: ingresá de nuevo." }
    : { ok: false, message: "El enlace no es válido, ya se usó o venció. Pedí uno nuevo." };
}
