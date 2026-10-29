// Se ejecuta antes de `next build`. En la compu no hace nada.
// En Vercel (variable VERCEL) arma la base de demo dentro del proyecto: prisma/demo.db con los datos de ejemplo
// y sus archivos en demo-storage/. Viajan dentro del deploy y la app los copia a la carpeta temporal al arrancar
// (ver src/lib/vercel-demo.ts). Si en Vercel se configura una base propia (DATABASE_URL), tampoco hace nada.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (!process.env.VERCEL || process.env.DATABASE_URL) process.exit(0);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, DATABASE_URL: "file:./demo.db", STORAGE_DIR: path.join(root, "demo-storage") };
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit", env });

for (const file of ["demo.db", "demo.db-journal"]) rmSync(path.join(root, "prisma", file), { force: true });
rmSync(env.STORAGE_DIR, { recursive: true, force: true });
console.log("[ContadorSmart] Armando la base de demo para Vercel...");
run("npx prisma db push --skip-generate");
run("npx tsx prisma/seed.ts");
