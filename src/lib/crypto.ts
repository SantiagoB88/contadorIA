import { createHash, randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";

/** Los tokens (sesión, verificación, recuperación) se guardan solo como hash SHA-256. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newRandomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

/** Devuelve un mensaje de error o null si la contraseña cumple la política mínima. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "La contraseña tiene que tener al menos 8 caracteres.";
  if (password.length > 200) return "La contraseña es demasiado larga.";
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(password) || !/\d/.test(password)) {
    return "La contraseña tiene que tener al menos una letra y un número.";
  }
  return null;
}
