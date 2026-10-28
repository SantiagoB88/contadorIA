// `npm run dev:test`: levanta una copia de la app para pruebas en http://localhost:3100,
// con una base propia recién sembrada (prisma/e2e.db) y su carpeta de archivos (storage-e2e/).
// No toca prisma/dev.db ni storage/, así que puede correr al mismo tiempo que `npm run dev`.
import { execSync, spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...process.env,
  DATABASE_URL: "file:./e2e.db",
  STORAGE_DIR: path.join(root, "storage-e2e"),
  NEXT_DIST_DIR: ".next-e2e",
};
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit", env });

for (const file of ["e2e.db", "e2e.db-journal"]) rmSync(path.join(root, "prisma", file), { force: true });
rmSync(env.STORAGE_DIR, { recursive: true, force: true });
run("npx prisma db push --skip-generate");
run("npx tsx prisma/seed.ts");

const port = process.env.PORT_TEST ?? "3100";
const child = spawn("npx", ["next", "dev", "-p", port], { cwd: root, stdio: "inherit", env, shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
