import { defineConfig } from "@playwright/test";

// Pruebas de punta a punta (`npm run test:e2e`). Usan el Edge instalado en la compu (no descargan navegadores)
// y una copia aparte de la app en http://localhost:3100 con su propia base (ver scripts/dev-test.mjs).
// Nunca tocan prisma/dev.db ni storage/.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // comparten la misma base de prueba: en orden, sin pisarse
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    channel: "msedge",
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
  },
  webServer: {
    command: "npm run dev:test",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
