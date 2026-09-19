/**
 * Money on the wire is always an integer string of minor units (centavos) —
 * see ADR-002. These helpers are the only place the web app converts to/from
 * the human-facing peso amount, so that conversion never happens twice with
 * two different roundings.
 */

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string): Intl.NumberFormat {
  let formatter = formatterCache.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency });
    formatterCache.set(currency, formatter);
  }
  return formatter;
}

export function formatMoney(minorUnits: string | number | bigint, currency = 'ARS'): string {
  const cents = typeof minorUnits === 'bigint' ? minorUnits : BigInt(Math.trunc(Number(minorUnits)));
  const majorUnits = Number(cents) / 100;
  return getFormatter(currency).format(majorUnits);
}

/** Parses a plain decimal string (from a number input, so always '.'-separated) into integer centavos. */
export function pesosToMinorUnits(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function minorUnitsToPesos(minorUnits: string | number | bigint): number {
  const cents = typeof minorUnits === 'bigint' ? minorUnits : BigInt(Math.trunc(Number(minorUnits)));
  return Number(cents) / 100;
}
