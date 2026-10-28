// `npm run verify`: crea una base aparte (prisma/verify.db), la siembra y corre las verificaciones.
// No toca la base que usás con `npm run dev` (prisma/dev.db).
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, DATABASE_URL: "file:./verify.db" };
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit", env });

// Se borra solo el archivo de prueba de corridas anteriores y se crea vacío con el esquema actual.
for (const file of ["verify.db", "verify.db-journal"]) {
  rmSync(path.join(root, "prisma", file), { force: true });
}
run("npx prisma db push --skip-generate");
run("npx tsx prisma/seed.ts");
run("npx tsx tests/verify.ts");
