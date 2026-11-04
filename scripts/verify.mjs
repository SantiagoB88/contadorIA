// `npm run verify`: crea una base aparte (prisma/verify.db), la siembra y corre las verificaciones.
// No toca la base que usás con `npm run dev` (prisma/dev.db) ni sus archivos (storage/).
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Archivos en una carpeta aparte: nunca se mezclan con los de `npm run dev` (storage/).
const storageDir = path.join(root, "storage-verify");
const env = { ...process.env, DATABASE_URL: "file:./verify.db", STORAGE_DIR: storageDir };
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit", env });

// Se borra solo el archivo de prueba de corridas anteriores y se crea vacío con el esquema actual.
// `npm run verify:turso`: las mismas verificaciones con la app conectada por el adaptador de Turso (libSQL), sobre una
// base libSQL local aparte (prisma/verify-turso.db). Comprueba que la demo de Vercel con Turso se comporta igual.
if (process.argv.includes("--turso")) {
  const tursoEnv = { ...process.env, TURSO_DATABASE_URL: "file:prisma/verify-turso.db" };
  delete tursoEnv.TURSO_AUTH_TOKEN;
  rmSync(path.join(root, "prisma", "verify-turso.db"), { force: true });
  execSync("node scripts/turso-prepare.mjs", { cwd: root, stdio: "inherit", env: tursoEnv });
  execSync("npx tsx tests/verify.ts", { cwd: root, stdio: "inherit", env: tursoEnv });
  process.exit(0);
}

for (const file of ["verify.db", "verify.db-journal"]) {
  rmSync(path.join(root, "prisma", file), { force: true });
}
rmSync(storageDir, { recursive: true, force: true });
run("npx prisma db push --skip-generate");
run("npx tsx prisma/seed.ts");
run("npx tsx tests/verify.ts");
