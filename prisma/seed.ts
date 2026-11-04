// Datos ficticios de demo. Uso: `npm run db:setup` (base vacía) o `npm run db:reset` (borra todo y vuelve a sembrar).
// Los datos están en src/modules/demo/seed-data.ts (los comparte el botón "Restablecer demo").
import { prisma } from "../src/lib/db";
import { seedDemo } from "../src/modules/demo/seed-data";

seedDemo({ reset: process.argv.includes("--reset") })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
