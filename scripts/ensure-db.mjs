// Se ejecuta antes de `npm run dev`:
//  - si la base local no existe, la crea y carga los datos de demo;
//  - si existe, aplica los cambios de esquema nuevos (sin borrar datos) y las actualizaciones de datos pendientes.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbFile = path.join(root, "prisma", "dev.db");
const envFile = path.join(root, ".env");

if (!existsSync(envFile)) {
  copyFileSync(path.join(root, ".env.example"), envFile);
  console.log("[ContadorSmart] Se creó .env a partir de .env.example");
}

const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

if (!existsSync(dbFile)) {
  console.log("[ContadorSmart] No existe la base local. Creándola con datos de demo...");
  run("npm run db:setup");
} else {
  // db push sin --accept-data-loss: si un cambio borrara datos, se detiene y avisa en lugar de borrar.
  run("npx prisma db push");
  run("npx tsx prisma/upgrade.ts");
}
