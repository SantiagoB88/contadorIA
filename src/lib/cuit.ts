/** "20-12345678-3" → "20123456783". No prueba titularidad, solo formato. */
export function normalizeCuit(input: string): string {
  return input.replace(/\D/g, "");
}

export function formatCuit(cuit: string): string {
  if (cuit.length !== 11) return cuit;
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}
