import { copyFileSync, cpSync, existsSync, linkSync, mkdirSync, renameSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Demo en Vercel sin servicios externos.
// Al compilar en Vercel (scripts/vercel-prepare.mjs) se arma una base de demo (prisma/demo.db) y sus archivos
// (demo-storage/), que viajan dentro del deploy. Ahí el disco del proyecto es de solo lectura, así que al arrancar
// se copian a la carpeta temporal y se trabaja sobre esa copia. Es una demo: cuando Vercel recicla la instancia,
// todo vuelve a los datos de ejemplo.
// En la compu (sin la variable VERCEL) no se usa nada de esto.

// Next carga este archivo más de una vez en el mismo servidor (páginas, acciones y rutas): la decisión se toma
// una sola vez y se comparte, así todas las partes usan la misma base y la misma carpeta de archivos.
const shared = globalThis as unknown as { contadorSmartDemo?: boolean };
shared.contadorSmartDemo ??= Boolean(process.env.VERCEL) && !process.env.DATABASE_URL;

/** Corre en Vercel y no se configuró una base propia: se usa la de demo incluida en el deploy. */
export const usesBundledDemo = shared.contadorSmartDemo;

let paths: { db: string; storage: string } | null = null;

/** Copia la base y los archivos de demo a la carpeta temporal (una sola vez por instancia). */
export function prepareBundledDemo() {
  if (paths) return paths;
  const dir = path.join(os.tmpdir(), "contadorsmart-demo");
  const db = path.join(dir, "demo.db");
  const storage = path.join(dir, "storage");
  mkdirSync(dir, { recursive: true });
  // Varios procesos pueden arrancar a la vez: cada uno prepara su copia aparte y solo la primera queda.
  // Nunca se reemplaza una base que otro proceso ya está usando.
  const unique = `${process.pid}-${Math.random().toString(36).slice(2)}`;
  if (!existsSync(db)) {
    const tmp = `${db}.${unique}`;
    copyFileSync(path.join(process.cwd(), "prisma", "demo.db"), tmp);
    try {
      linkSync(tmp, db); // falla si ya existe: es atómico
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    } finally {
      rmSync(tmp, { force: true });
    }
  }
  if (!existsSync(storage)) {
    const tmp = `${storage}.${unique}`;
    const source = path.join(process.cwd(), "demo-storage");
    if (existsSync(source)) cpSync(source, tmp, { recursive: true });
    else mkdirSync(tmp, { recursive: true });
    try {
      renameSync(tmp, storage); // falla si otro proceso ya la dejó lista
    } catch {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  paths = { db, storage };
  return paths;
}
