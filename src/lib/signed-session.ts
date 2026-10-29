import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Sesión firmada para la demo en Vercel. Ahí cada parte de la app puede correr en una instancia distinta,
// cada una con su copia de la base: una sesión guardada en la base de una instancia no la ve la otra y el
// usuario "se desloguea" al cambiar de módulo. Con la firma, cualquier instancia valida la cookie sin la base.
// La firma usa un secreto que se genera en cada deploy (no está en el repositorio).
// Sin dependencias de Next, para poder probarlo con `npm run verify`.

export type SessionClaims = {
  uid: string; // usuario
  exp: number; // vencimiento (ms)
  pwv: string; // huella de la contraseña: si cambia la contraseña, la sesión deja de valer
};

/** Huella corta del hash de la contraseña (no permite recuperar nada). */
export function passwordVersion(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16);
}

function mac(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function signSession(claims: SessionClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${mac(body, secret)}`;
}

/** Devuelve los datos si la firma es válida y no venció; si no, null. */
export function readSession(token: string, secret: string, now = Date.now()): SessionClaims | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined || !secret) return null;
  const expected = Buffer.from(mac(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionClaims;
    if (typeof claims.uid !== "string" || typeof claims.exp !== "number" || typeof claims.pwv !== "string") return null;
    return claims.exp > now ? claims : null;
  } catch {
    return null;
  }
}
