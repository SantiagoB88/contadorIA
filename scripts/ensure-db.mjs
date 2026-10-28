// Se ejecuta antes de `npm run dev`: si la base local no existe, la crea y carga los datos de demo.
// Si ya existe, no toca nada (los datos se conservan entre reinicios).
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

if (!existsSync(dbFile)) {
  console.log("[ContadorSmart] No existe la base local. Creándola con datos de demo...");
  execSync("npm run db:setup", { cwd: root, stdio: "inherit" });
}
