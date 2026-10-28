import { connection } from "next/server";
import { prisma } from "./db";
import { SCHEMA_META_KEY, SCHEMA_VERSION } from "./schema-version";

// Si el servidor quedó abierto mientras se actualizaba el código, la base no coincide con lo que espera:
// en lugar de un error técnico se muestra cómo arreglarlo.

let upToDate = false;

export async function isDbUpToDate(): Promise<boolean> {
  await connection(); // se consulta en cada pedido, nunca al compilar
  if (upToDate) return true;
  try {
    const meta = await prisma.appMeta.findUnique({ where: { key: SCHEMA_META_KEY } });
    upToDate = meta?.value === SCHEMA_VERSION;
  } catch {
    upToDate = false; // por ejemplo, la tabla todavía no existe
  }
  return upToDate;
}
