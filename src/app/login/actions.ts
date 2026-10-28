"use server";

import { redirect } from "next/navigation";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { clearAttempts, createSession, isRateLimited, registerFailedAttempt } from "@/lib/auth";

export type LoginState = { error?: string; email?: string };

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = String(formData.get("email") ?? "");
  const parsed = schema.safeParse({ email: rawEmail, password: formData.get("password") ?? "" });
  if (!parsed.success) {
    return { error: "Ingresá un correo válido y tu contraseña.", email: rawEmail };
  }

  const { email, password } = parsed.data;
  if (isRateLimited(email)) {
    return { error: "Hubo demasiados intentos. Esperá unos minutos y volvé a probar.", email };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user !== null && user.active && (await compare(password, user.passwordHash));
  if (!valid || !user) {
    registerFailedAttempt(email);
    // Mensaje genérico: no revela si el correo existe.
    return { error: "El correo o la contraseña no son correctos.", email };
  }

  clearAttempts(email);
  await createSession(user.id);
  await audit({ studyId: user.studyId, actorId: user.id, action: "LOGIN", entity: "User", entityId: user.id });
  redirect("/dashboard");
}
