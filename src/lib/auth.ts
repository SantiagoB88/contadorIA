import { cookies } from "next/headers";
import { hashToken, newRandomToken } from "./crypto";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { ROLES, SESSION_COOKIE, SESSION_DAYS } from "./constants";
import { passwordVersion, readSession, signSession } from "./signed-session";
import { usesBundledDemo } from "./vercel-demo";

export type CurrentUser = {
  id: string;
  studyId: string;
  studyName: string;
  email: string;
  name: string;
  role: string;
};

// En la demo de Vercel la sesión va firmada en la cookie (ver signed-session.ts); en la compu, en la base.
// El secreto de la firma lo genera scripts/vercel-prepare.mjs en cada deploy y queda en la base de demo.
const DEMO_SECRET_KEY = "demo-session-secret";
const secretCache = globalThis as unknown as { contadorSmartSessionSecret?: string };

async function demoSecret(): Promise<string> {
  secretCache.contadorSmartSessionSecret ??=
    (await prisma.appMeta.findUnique({ where: { key: DEMO_SECRET_KEY }, select: { value: true } }))?.value ?? "";
  return secretCache.contadorSmartSessionSecret;
}

/** Crea la sesión y deja el token en una cookie HttpOnly. Solo desde Server Actions. */
export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  let token: string;
  if (usesBundledDemo) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    const secret = await demoSecret();
    if (!secret) throw new Error("Falta el secreto de sesión de la demo (scripts/vercel-prepare.mjs).");
    token = signSession({ uid: userId, exp: expiresAt.getTime(), pwv: passwordVersion(user.passwordHash) }, secret);
  } else {
    token = newRandomToken();
    await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Borra la sesión actual de la base y la cookie. Solo desde Server Actions. */
export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token && !usesBundledDemo) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}

/** Usuario de la sesión actual, o null. Se valida contra la base en cada petición. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  if (usesBundledDemo) {
    // Se valida la firma y, en la base, que el usuario siga activo y no haya cambiado la contraseña.
    const claims = readSession(token, await demoSecret());
    if (!claims) return null;
    const user = await prisma.user.findUnique({ where: { id: claims.uid }, include: { study: true } });
    if (!user || !user.active || passwordVersion(user.passwordHash) !== claims.pwv) return null;
    return { id: user.id, studyId: user.studyId, studyName: user.study.name, email: user.email, name: user.name, role: user.role };
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { study: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;

  const { user } = session;
  return {
    id: user.id,
    studyId: user.studyId,
    studyName: user.study.name,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== ROLES.ADMIN) redirect("/dashboard");
  return user;
}

// Límite simple de intentos de login, en memoria (suficiente para la demo local).
const attempts = new Map<string, { count: number; firstAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

export function isRateLimited(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function registerFailedAttempt(key: string) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}
