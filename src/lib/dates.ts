// Fechas contables como texto "YYYY-MM-DD" en la zona horaria de Argentina.
const TZ = "America/Argentina/Buenos_Aires";

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function todayAR(): string {
  // en-CA produce el formato YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseYmd(s: string): { year: number; month: number; day: number } {
  const [year, month, day] = s.split("-").map(Number);
  return { year, month, day };
}

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { year, month, day } = parseYmd(s);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Suma (o resta) días a una fecha "YYYY-MM-DD". */
export function addDaysYmd(s: string, delta: number): string {
  const { year, month, day } = parseYmd(s);
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Suma (o resta) meses a un par año/mes. */
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function monthKey(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

export function monthLabelShort(year: number, month: number): string {
  return `${MONTHS_SHORT[month - 1]} ${String(year).slice(2)}`;
}

export function monthLabelLong(year: number, month: number): string {
  return `${MONTHS_LONG[month - 1]} ${year}`;
}

/** "2026-10-28" → "28/10/2026" */
export function formatDateAR(s: string): string {
  const { year, month, day } = parseYmd(s);
  return `${pad(day)}/${pad(month)}/${year}`;
}

export function formatDateTimeAR(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
