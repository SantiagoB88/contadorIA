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

/** Validación formal: 11 dígitos, prefijo conocido y dígito verificador (módulo 11). */
export function isValidCuit(cuit: string): boolean {
  if (!/^\d{11}$/.test(cuit)) return false;
  if (!PREFIXES.includes(cuit.slice(0, 2))) return false;
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(cuit[i]), 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) return false;
  return check === Number(cuit[10]);
}
