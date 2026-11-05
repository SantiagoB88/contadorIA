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

// Secreto para firmar las sesiones de la demo y cifrar lo que guarda el navegador, dentro de la base de demo, así
// todas las instancias de Vercel lo comparten (ver src/lib/auth.ts, src/lib/demo-accounts.ts).
// Se guarda en la caché de compilación de Vercel (.next/cache, privada, no se publica) y se reusa en el deploy
// siguiente: si cambiara en cada deploy, al publicar se perderían las sesiones y las cuentas creadas en la demo.
// Si Vercel borra la caché, se genera uno nuevo.
const { randomBytes } = await import("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = await import("node:fs");
const secretFile = path.join(root, ".next", "cache", "contadorsmart-demo-secret");
let secret = existsSync(secretFile) ? readFileSync(secretFile, "utf8").trim() : "";
if (!/^[0-9a-f]{64}$/.test(secret)) {
  secret = randomBytes(32).toString("hex");
  mkdirSync(path.dirname(secretFile), { recursive: true });
  writeFileSync(secretFile, secret);
  console.log("[ContadorSmart] Secreto de la demo nuevo (no había uno en la caché de compilación).");
} else {
  console.log("[ContadorSmart] Secreto de la demo reusado de la caché de compilación.");
}
const { default: prismaPkg } = await import("@prisma/client");
const prisma = new prismaPkg.PrismaClient({ datasourceUrl: `file:${path.join(root, "prisma", "demo.db").split("\\").join("/")}` });
await prisma.appMeta.create({ data: { key: "demo-session-secret", value: secret } });
await prisma.$disconnect();
console.log("[ContadorSmart] Base de demo lista.");
