/** "20-12345678-3" → "20123456783". No prueba titularidad, solo formato. */
export function normalizeCuit(input: string): string {
  return input.replace(/\D/g, "");
}

export function formatCuit(cuit: string): string {
  if (cuit.length !== 11) return cuit;
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const PREFIXES = ["20", "23", "24", "27", "30", "33", "34"];

/** Dígito verificador que corresponde a los primeros 10 números (módulo 11). null si no hay ninguno posible. */
export function cuitCheckDigit(first10: string): number | null {
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(first10[i]), 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  return check === 10 ? null : check;
}

/** Validación formal: 11 dígitos, prefijo conocido y dígito verificador (módulo 11). No consulta ningún padrón. */
export function isValidCuit(cuit: string): boolean {
  if (!/^\d{11}$/.test(cuit)) return false;
  if (!PREFIXES.includes(cuit.slice(0, 2))) return false;
  return cuitCheckDigit(cuit.slice(0, 10)) === Number(cuit[10]);
}

/** Por qué un CUIT no es válido, en palabras (para guiar a la persona sin adivinar). */
export function cuitProblem(cuit: string): string | null {
  if (!/^\d{11}$/.test(cuit)) return `tiene que tener 11 números y tiene ${cuit.length}.`;
  if (!PREFIXES.includes(cuit.slice(0, 2))) return `tiene que empezar con ${PREFIXES.join(", ")} (empieza con ${cuit.slice(0, 2)}).`;
  const check = cuitCheckDigit(cuit.slice(0, 10));
  if (check === null) return "con esos primeros 10 números no existe un CUIT válido (revisá el DNI o el prefijo).";
  if (check !== Number(cuit[10])) return `el último número (dígito verificador) no coincide: con esos primeros 10 números tendría que ser ${check}.`;
  return null;
}
