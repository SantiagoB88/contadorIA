// Arranque en Railway (prueba temporal del bot de WhatsApp real). En la compu y en Vercel no se usa.
// Railway corre un solo servidor siempre prendido: la base SQLite vive en su disco.
//  - Con un volumen montado (RAILWAY_VOLUME_MOUNT_PATH), los datos sobreviven a los redeploys.
//  - Sin volumen, se guardan en el disco del contenedor y vuelven a los datos de ejemplo en cada deploy
//    (alcanza para una prueba momentánea).
// Esta base es solo de Railway: no se comparte con la compu (dev.db) ni con la demo de Vercel.
import { execSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(root, "data");
mkdirSync(dataDir, { recursive: true });

const env = {
  ...process.env,
  APP_MODE: process.env.APP_MODE || "DEMO",
  // Demo completa en un solo servidor: también el simulador de WhatsApp (solo existe en modo DEMO).
  ENABLE_BOT_SIMULATOR: process.env.ENABLE_BOT_SIMULATOR || "1",
  // Demo pública: bandeja de correos de prueba y usuarios de ejemplo a la vista (ver src/lib/demo-tools.ts).
  PUBLIC_DEMO_TOOLS: process.env.PUBLIC_DEMO_TOOLS || "1",
  DATABASE_URL: process.env.DATABASE_URL || `file:${path.join(dataDir, "contadorsmart.db").split("\\").join("/")}`,
  STORAGE_DIR: process.env.STORAGE_DIR || path.join(dataDir, "storage"),
};
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit", env });

console.log(`[ContadorSmart] Railway: base en ${env.DATABASE_URL.replace(/^file:/, "")}, modo ${env.APP_MODE}.`);
// Crea las tablas si faltan y aplica cambios de esquema sin borrar datos (si un cambio borrara datos, se detiene).
run("npx prisma db push --skip-generate");

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
const empty = (await prisma.study.count()) === 0;
await prisma.$disconnect();
if (empty) {
  console.log("[ContadorSmart] Base nueva: se cargan los datos de ejemplo.");
  run("npx tsx prisma/seed.ts");
} else {
  run("npx tsx prisma/upgrade.ts");
}

const missing = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"].filter((k) => !process.env[k]);
if (missing.length) console.log(`[ContadorSmart] Faltan variables de WhatsApp: ${missing.join(", ")}. El webhook no va a responder hasta cargarlas.`);

const port = process.env.PORT || "3000";
// Next directo con el mismo Node (sin npx: funciona igual en Linux y en Windows).
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "start", "-p", port, "-H", "0.0.0.0"], { cwd: root, stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
