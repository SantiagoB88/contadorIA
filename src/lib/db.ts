import { PrismaClient } from "@prisma/client";
import { prepareBundledDemo, usesBundledDemo } from "./vercel-demo";

// Una sola instancia por servidor: Next recarga módulos en desarrollo y, compilado, carga este archivo
// por separado en páginas, acciones y rutas. Con SQLite conviene una sola conexión compartida.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  // En Vercel, sin una base propia configurada, se usa la copia de la base de demo (ver vercel-demo.ts).
  if (usesBundledDemo) {
    const url = `file:${prepareBundledDemo().db.split("\\").join("/")}`;
    // El esquema nombra DATABASE_URL: queda definida aunque en Vercel no exista (la decisión ya se tomó antes).
    process.env.DATABASE_URL ||= url;
    return new PrismaClient({ datasourceUrl: url });
  }
  return new PrismaClient();
}

export const prisma = (globalForPrisma.prisma ??= createClient());
