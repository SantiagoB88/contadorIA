// Se ejecuta antes de `next build`. En la compu no hace nada.
// En Vercel (variable VERCEL) arma la base de demo dentro del proyecto: prisma/demo.db con los datos de ejemplo
// y sus archivos en demo-storage/. Viajan dentro del deploy y la app los copia a la carpeta temporal al arrancar
// (ver src/lib/vercel-demo.ts). Si en Vercel se configura una base propia (DATABASE_URL), tampoco hace nada.
// Con TURSO_DATABASE_URL prepara la base compartida de Turso (ver scripts/turso-prepare.mjs).
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (!process.env.VERCEL || process.env.DATABASE_URL) process.exit(0);

// Con la base compartida de Turso no se arma la base incluida: se prepara Turso (solo en el deploy de producción,
// así una vista previa de otra rama no borra los datos de la demo publicada).
if (process.env.TURSO_DATABASE_URL) {
  if (process.env.VERCEL_ENV === "production") {
    execSync("node scripts/turso-prepare.mjs", { stdio: "inherit" });
  } else {
    console.log("[ContadorSmart] Vista previa con Turso: se usa la base tal como está.");
  }
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, DATABASE_URL: "file:./demo.db", STORAGE_DIR: path.join(root, "demo-storage") };
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit", env });

for (const file of ["demo.db", "demo.db-journal"]) rmSync(path.join(root, "prisma", file), { force: true });
rmSync(env.STORAGE_DIR, { recursive: true, force: true });
console.log("[ContadorSmart] Armando la base de demo para Vercel...");
run("npx prisma db push --skip-generate");
run("npx tsx prisma/seed.ts");

// Secreto para firmar las sesiones de la demo: nuevo en cada deploy y guardado dentro de la base de demo,
// así todas las instancias de Vercel lo comparten (ver src/lib/auth.ts y src/lib/signed-session.ts).
const { randomBytes } = await import("node:crypto");
const { default: prismaPkg } = await import("@prisma/client");
const prisma = new prismaPkg.PrismaClient({ datasourceUrl: `file:${path.join(root, "prisma", "demo.db").split("\\").join("/")}` });
await prisma.appMeta.create({ data: { key: "demo-session-secret", value: randomBytes(32).toString("hex") } });
await prisma.$disconnect();
console.log("[ContadorSmart] Base de demo lista.");
