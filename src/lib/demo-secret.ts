import { prisma } from "./db";

// Secreto de la demo de Vercel: lo genera scripts/vercel-prepare.mjs en cada deploy y queda en la base de demo, así
// todas las copias del servidor lo comparten. Firma las sesiones y las cuentas creadas durante la demo.
const DEMO_SECRET_KEY = "demo-session-secret";
const secretCache = globalThis as unknown as { contadorSmartSessionSecret?: string };

export async function demoSecret(): Promise<string> {
  secretCache.contadorSmartSessionSecret ??=
    (await prisma.appMeta.findUnique({ where: { key: DEMO_SECRET_KEY }, select: { value: true } }))?.value ?? "";
  return secretCache.contadorSmartSessionSecret;
}
