import { APP_MODE } from "@/lib/constants";

// El simulador de WhatsApp existe solo para probar en la compu: modo DEMO y fuera de producción
// (o con ENABLE_BOT_SIMULATOR=1 para las pruebas automáticas). Solo usa números ficticios de un rango fijo,
// así nunca puede hacerse pasar por un número real.

export function simulatorEnabled(): boolean {
  return APP_MODE === "DEMO" && (process.env.NODE_ENV !== "production" || process.env.ENABLE_BOT_SIMULATOR === "1") && !process.env.VERCEL;
}

/** Rango ficticio reservado al simulador: +54 9 11 5555-0000 a 5555-0999. */
export function isSimulatorAddress(address: string): boolean {
  return /^\+5491155550\d{3}$/.test(address);
}

export const SIMULATOR_IDENTITIES = [
  { address: "+5491155550001", label: "Ana Gómez (cliente.a) · WhatsApp vinculado" },
  { address: "+5491155550002", label: "Bruno Díaz (cliente.b) · cuenta sin vincular" },
  { address: "+5491155550003", label: "Persona nueva · sin cuenta" },
  { address: "+5491155550004", label: "Otra persona nueva · sin cuenta" },
] as const;
