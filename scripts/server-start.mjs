// Arranque en un servidor propio (piloto en el VPS). En la compu se usa `npm run dev` y en Vercel la demo incluida.
// - La base SQLite y los archivos viven en DATA_DIR (por defecto /var/lib/contadorsmart): sobreviven a reinicios y
//   actualizaciones del código.
// - Al arrancar aplica los cambios de esquema sin borrar datos (si un cambio borrara datos, se detiene y avisa).
// - Si la base está vacía la prepara: SEED_MODE=piloto (por defecto) crea solo el estudio y su administrador
//   (prisma/seed-piloto.ts); SEED_MODE=demo carga los datos de ejemplo.
// - Escucha en HOST:PORT (por defecto 127.0.0.1:3000): lo publica Caddy con HTTPS (deploy/Caddyfile).
// Los secretos (WhatsApp, administrador) vienen del archivo de entorno privado del servidor (deploy/README).
import { execSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DATA_DIR || "/var/lib/contadorsmart";
mkdirSync(dataDir, { recursive: true });

const env = {
  ...process.env,
  APP_MODE: process.env.APP_MODE || "PILOTO", // servidor con personas reales (ver src/lib/constants.ts)
  DATABASE_URL: process.env.DATABASE_URL || `file:${path.join(dataDir, "contadorsmart.db").split("\\").join("/")}`,
  STORAGE_DIR: process.env.STORAGE_DIR || path.join(dataDir, "storage"),
};
// Binarios del proyecto con el mismo Node (sin npx: el servicio no puede escribir en la carpeta del usuario).
const bin = (rel) => `"${process.execPath}" "${path.join(root, "node_modules", rel)}"`;
const PRISMA = bin("prisma/build/index.js");
const TSX = bin("tsx/dist/cli.mjs");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit", env });

console.log(`[ContadorSmart] Base: ${env.DATABASE_URL.replace(/^file:/, "")} · archivos: ${env.STORAGE_DIR} · modo ${env.APP_MODE}.`);
run(`${PRISMA} db push --skip-generate`);

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
const empty = (await prisma.study.count()) === 0;
await prisma.$disconnect();
if (empty) {
  const mode = process.env.SEED_MODE || "piloto";
  console.log(`[ContadorSmart] Base nueva: se prepara en modo ${mode}.`);
  run(`${TSX} ${mode === "demo" ? "prisma/seed.ts" : "prisma/seed-piloto.ts"}`);
} else {
  run(`${TSX} prisma/upgrade.ts`);
}

const missing = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"].filter((k) => !process.env[k]);
if (missing.length) console.log(`[ContadorSmart] Faltan variables de WhatsApp: ${missing.join(", ")}. El webhook no va a funcionar hasta cargarlas.`);
if (!process.env.APP_URL) console.log("[ContadorSmart] Falta APP_URL (https://tu-dominio): los enlaces de los avisos usan la dirección de cada pedido.");

const host = process.env.HOST || "127.0.0.1";
const port = process.env.PORT || "3000";
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "start", "-p", port, "-H", host], { cwd: root, stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
