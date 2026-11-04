// Prepara la base compartida de Turso (demo en Vercel). La llama scripts/vercel-prepare.mjs al compilar en Vercel
// y se puede correr a mano con `npm run turso:prepare` (con TURSO_DATABASE_URL y TURSO_AUTH_TOKEN en el entorno).
// - Si la base ya tiene el esquema de esta versión (AppMeta "schema-version"), no toca nada: los datos se conservan.
// - Si está vacía o el esquema cambió, borra las tablas, crea el esquema actual y carga los datos de demo.
//   Es una demo con datos ficticios: un cambio de esquema la vuelve al estado inicial.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@libsql/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("[Turso] Falta TURSO_DATABASE_URL.");
  process.exit(1);
}
const expected = readFileSync(path.join(root, "src", "lib", "schema-version.ts"), "utf8").match(/SCHEMA_VERSION = "([^"]+)"/)[1];
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });

let current = null;
try {
  const r = await db.execute({ sql: "SELECT value FROM AppMeta WHERE key = ?", args: ["schema-version"] });
  current = r.rows[0]?.value ?? null;
} catch {
  current = null; // base vacía
}
if (current === expected) {
  console.log(`[Turso] La base ya tiene el esquema ${expected}: se conservan los datos.`);
  db.close();
  process.exit(0);
}

console.log(`[Turso] Esquema en la base: ${current ?? "ninguno"}; esquema actual: ${expected}. Se recrea con los datos de demo.`);
const tables = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\_%' ESCAPE '\' AND name <> 'libsql_wasm_func_table'");
const drops = tables.rows.map((t) => `DROP TABLE IF EXISTS "${String(t.name).replace(/"/g, '""')}";`);
await db.executeMultiple(["PRAGMA foreign_keys = OFF;", ...drops, "PRAGMA foreign_keys = ON;"].join("\n"));

const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "file:./no-se-usa-con-turso.db" };
const sql = execSync("npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script", { cwd: root, env, encoding: "utf8" });
await db.executeMultiple(sql);
db.close();

// Los datos de demo se cargan con el mismo código que en la compu, conectado a Turso (ver src/lib/db.ts).
execSync("npx tsx prisma/seed.ts", { cwd: root, env, stdio: "inherit" });
console.log("[Turso] Base lista.");
