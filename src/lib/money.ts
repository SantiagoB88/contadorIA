// Importes en centavos (bigint). La conversión a número solo se hace para mostrar.
const formatter = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

export function formatARS(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const pesos = abs / 100n;
  const rest = abs % 100n;
  // Number(pesos) es exacto mientras el importe sea menor a 9 billones de pesos.
  const text = formatter.format(Number(pesos) + Number(rest) / 100);
  return negative ? `-${text}` : text;
}

/**
 * Convierte texto ingresado por el usuario a centavos.
 * Acepta "1234", "1234,5", "1.234,56", "1234.56" y "$ 1.234,56".
 * Devuelve null si el formato no es válido.
 */
export function parseAmountToCents(input: string): bigint | null {
  let s = input.trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!s) return null;

  if (s.includes(",")) {
    // Formato argentino: el punto es separador de miles y la coma, decimal.
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234.567" sin decimales: puntos de miles.
    s = s.replace(/\./g, "");
  } else if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return null;
  }

  const [intPart, decPart = ""] = s.split(".");
  return BigInt(intPart) * 100n + BigInt(decPart.padEnd(2, "0"));
}

/** Cantidad a milésimas: "1" → 1000, "1,5" → 1500, "2.25" → 2250. Null si no es válida. */
export function parseQuantityMilli(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(s)) return null;
  const [intPart, decPart = ""] = s.split(".");
  return Number(intPart) * 1000 + Number(decPart.padEnd(3, "0"));
}

export function formatQuantity(milli: number): string {
  return (milli / 1000).toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

/** Subtotal de una línea en centavos, redondeado al centavo (mitad hacia arriba). */
export function lineSubtotalCents(quantityMilli: number, unitPriceCents: bigint): bigint {
  return (BigInt(quantityMilli) * unitPriceCents + 500n) / 1000n;
}

/** Porcentaje con un decimal, calculado en enteros para no perder precisión. */
export function percentTenths(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  // Redondeo al décimo más cercano.
  return Number((part * 1000n + total / 2n) / total);
}
