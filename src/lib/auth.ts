import { cookies } from "next/headers";
import { hashToken, newRandomToken } from "./crypto";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { ROLES, SESSION_COOKIE, SESSION_DAYS } from "./constants";

export type CurrentUser = {
  id: string;
  studyId: string;
  studyName: string;
  email: string;
  name: string;
  role: string;
};


/** Crea una sesión en la base y deja el token en una cookie HttpOnly. Solo desde Server Actions. */
export async function createSession(userId: string) {
  const token = newRandomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });

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
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}

/** Usuario de la sesión actual, o null. Se valida contra la base en cada petición. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

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
