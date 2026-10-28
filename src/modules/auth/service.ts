import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ROLES, TOKEN_TYPE } from "@/lib/constants";
import { hashPassword, hashToken, newRandomToken } from "@/lib/crypto";
import { mail } from "@/providers/mail";

// Lógica de cuentas sin dependencias de Next: la usan las Server Actions y las verificaciones.

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

type TokenType = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];

/** Crea un token de un solo uso e invalida los anteriores del mismo tipo. Devuelve el token en claro. */
export async function issueToken(userId: string, type: TokenType): Promise<string> {
  const token = newRandomToken();
  const ttl = type === TOKEN_TYPE.VERIFICAR_CORREO ? VERIFY_TTL_MS : RESET_TTL_MS;
  await prisma.$transaction([
    prisma.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.authToken.create({
      data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttl) },
    }),
  ]);
  return token;
}

/** Marca el token como usado y devuelve el userId. Null si no existe, venció o ya se usó. */
export async function consumeToken(token: string, type: TokenType): Promise<string | null> {
  if (!token) return null;
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
  // updateMany con usedAt: null evita que dos pedidos simultáneos usen el mismo token.
  const { count } = await prisma.authToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1 ? row.userId : null;
}

/** Valida sin consumir (para mostrar la pantalla de restablecer solo si el enlace sirve). */
export async function isTokenUsable(token: string, type: TokenType): Promise<boolean> {
  if (!token) return false;
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  return !!row && row.type === type && !row.usedAt && row.expiresAt >= new Date();
}

export async function sendVerificationEmail(user: { id: string; email: string; name: string }, origin: string) {
  const token = await issueToken(user.id, TOKEN_TYPE.VERIFICAR_CORREO);
  await mail.send({
    to: user.email,
    subject: "Confirmá tu correo en ContadorSmart",
    body: `Hola ${user.name}:\n\nPara activar tu cuenta, abrí este enlace (vence en 24 horas):\n${origin}/verificar?token=${token}\n\nSi no creaste una cuenta, ignorá este correo.`,
  });
}

export type RegisterInput = { name: string; email: string; phone: string; password: string };

/**
 * Registra un cliente. Si el correo ya existe no se informa en pantalla (no se revela quién tiene cuenta):
 * se le manda un aviso al dueño del correo.
 */
export async function registerUser(input: RegisterInput, origin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await mail.send({
      to: email,
      subject: "Ya tenés una cuenta en ContadorSmart",
      body: `Hola:\n\nAlguien intentó crear una cuenta con este correo, pero ya tenés una.\nSi no recordás la contraseña, podés recuperarla en:\n${origin}/recuperar\n\nSi no fuiste vos, ignorá este correo.`,
    });
    return { ok: true };
  }

  const study = await prisma.study.findFirst({ where: { acceptsSignups: true }, orderBy: { createdAt: "asc" } });
  if (!study) return { ok: false, error: "El registro no está habilitado en este momento." };

  const user = await prisma.user.create({
    data: {
      studyId: study.id,
      email,
      name: input.name.trim(),
      phone: input.phone.trim(),
      passwordHash: await hashPassword(input.password),
      role: ROLES.CLIENTE,
    },
  });
  await audit({ studyId: study.id, actorId: user.id, action: "USER_REGISTER", entity: "User", entityId: user.id });
  await sendVerificationEmail(user, origin);
  return { ok: true };
}

export async function verifyEmail(token: string): Promise<boolean> {
  const userId = await consumeToken(token, TOKEN_TYPE.VERIFICAR_CORREO);
  if (!userId) return false;
  const user = await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ studyId: user.studyId, actorId: user.id, action: "EMAIL_VERIFIED", entity: "User", entityId: user.id });
  return true;
}

/** Siempre termina igual para quien lo pide: no revela si el correo existe. */
export async function requestPasswordReset(emailInput: string, origin: string) {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return;
  const token = await issueToken(user.id, TOKEN_TYPE.RESTABLECER_CLAVE);
  await mail.send({
    to: user.email,
    subject: "Restablecé tu contraseña de ContadorSmart",
    body: `Hola ${user.name}:\n\nPara elegir una contraseña nueva, abrí este enlace (vence en 1 hora y sirve una sola vez):\n${origin}/restablecer?token=${token}\n\nSi no lo pediste, ignorá este correo: tu contraseña no cambia.`,
  });
  await audit({ studyId: user.studyId, actorId: user.id, action: "PASSWORD_RESET_REQUEST", entity: "User", entityId: user.id });
}

/** Cambia la contraseña con un token válido y cierra todas las sesiones abiertas. */
export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const userId = await consumeToken(token, TOKEN_TYPE.RESTABLECER_CLAVE);
  if (!userId) return false;
  const passwordHash = await hashPassword(newPassword);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: userId },
      // Recibir el correo de recuperación también prueba que el correo es suyo.
      data: { passwordHash, emailVerifiedAt: new Date() },
    });
    await tx.session.deleteMany({ where: { userId } });
    return u;
  });
  await audit({ studyId: user.studyId, actorId: user.id, action: "PASSWORD_RESET", entity: "User", entityId: user.id });
  return true;
}
