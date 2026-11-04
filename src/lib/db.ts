import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { prepareBundledDemo, usesBundledDemo, usesTursoDb } from "./vercel-demo";

// Una sola instancia por servidor: Next recarga módulos en desarrollo y, compilado, carga este archivo
// por separado en páginas, acciones y rutas. Con SQLite conviene una sola conexión compartida.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  // Base compartida en Turso (demo en Vercel): mismo esquema SQLite, conexión por la red con el adaptador libSQL.
  if (usesTursoDb) {
    // El esquema nombra DATABASE_URL; con el adaptador no se usa, pero tiene que existir.
    process.env.DATABASE_URL ||= "file:./no-se-usa-con-turso.db";
    // intMode "bigint": los enteros vuelven exactos. Con el modo por defecto, un importe en centavos mayor a 2^31
    // (por ejemplo un límite de categoría) llega como decimal y Prisma lo rechaza.
    const adapter = new PrismaLibSQL({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN || undefined, intMode: "bigint" });
    return new PrismaClient({ adapter });
  }
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
