import type { ModuleKey } from "@/modules/plans/catalog";

// Qué módulo del plan hace falta para cada opción del asistente. "Mi resumen", "Mi cuenta", el menú y el cambio de
// contribuyente están siempre (como Inicio y Mi perfil en la web).
const RULES: [RegExp, ModuleKey][] = [
  [/^(m\.fact|f\.)/, "FACTURACION"],
  [/^m\.cat$/, "CATEGORIA"],
  [/^(m\.deudas|d\.)/, "DEUDAS"],
  [/^(m\.docs|doc\.)/, "DOCUMENTOS"],
  [/^(m\.sol|m\.estudio|s\.)/, "SOLICITUDES"],
];

export function moduleForAction(action: string): ModuleKey | null {
  for (const [re, key] of RULES) if (re.test(action)) return key;
  return null;
}
