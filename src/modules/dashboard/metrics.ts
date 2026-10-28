import { prisma } from "@/lib/db";
import { APP_MODE, COUNTED_INVOICE_STATUSES } from "@/lib/constants";
import { percentTenths } from "@/lib/money";
import {
  addMonths,
  daysInMonth,
  monthKey,
  monthLabelLong,
  monthLabelShort,
  parseYmd,
  todayAR,
  ymd,
} from "@/lib/dates";
import { findScaleForDate, sortedLimits } from "@/modules/fiscal/scales";
import { getCategoryAt } from "@/modules/fiscal/category";

// Servicio común de indicadores. Todo se calcula en el servidor; las pantallas solo muestran.
// Versión de reglas que se informa junto con cada respuesta.
export const RULES_VERSION = "demo-2026.10-v2";

export type CoverageState = "COMPLETA" | "PARCIAL" | "SIN_DATOS";

export type PeriodMetric = {
  key: "mensual" | "semestral" | "anual" | "movil12";
  label: string;
  description: string;
  from: string;
  to: string;
  totalCents: bigint | null; // null = sin datos (nunca un falso cero)
  invoiceCount: number;
  coverage: CoverageState;
};

export type MonthBar = {
  key: string;
  label: string;
  longLabel: string;
  totalCents: bigint;
  coverage: CoverageState;
};

export type AlertLevel = "NORMAL" | "PREVENTIVO" | "PROXIMO" | "SUPERADO";

export type ScaleInfo = {
  id: string;
  name: string;
  status: string;
  source: string;
  validFrom: string;
  validTo: string | null;
  limits: { code: string; annualLimitCents: bigint }[]; // ordenados A, B, C…
};

// Sugerencia por ingresos: nunca reemplaza ni cambia la categoría registrada.
export type CategorySuggestion = { available: true; code: string | null; aboveTop: boolean } | { available: false; reason: string };

export type CategoryInfo = {
  code: string | null; // categoría registrada a la fecha de corte
  since: string | null; // desde cuándo rige (null si no hay historial)
  scale: ScaleInfo | null; // escala vigente a la fecha de corte
  suggestion: CategorySuggestion;
};

export type MarginInfo =
  | {
      available: true;
      categoryCode: string;
      scaleName: string;
      scaleStatus: string;
      referenceFrom: string;
      referenceTo: string;
      limitCents: bigint;
      incomeCents: bigint;
      marginCents: bigint; // positivo = margen disponible; negativo = exceso
      percentTenths: number; // 963 = 96,3 %
      level: AlertLevel;
      note: string | null;
    }
  | { available: false; categoryCode: string | null; reason: string };

export type DashboardData = {
  cutDate: string;
  environment: string;
  rulesVersion: string;
  currency: "ARS";
  periods: PeriodMetric[];
  chart: MonthBar[];
  margin: MarginInfo;
  category: CategoryInfo;
  coverage: { source: string; fromDate: string; complete: boolean; updatedAt: Date } | null;
};

type TaxpayerInput = { id: string; studyId: string; categoryCode: string | null; startDate: string };
type CoverageRow = { fromDate: string; complete: boolean; source: string; updatedAt: Date } | null;

/**
 * Fecha de corte según el mes elegido ("YYYY-MM"):
 * mes actual (o inválido/futuro) → hoy; mes pasado → último día de ese mes.
 */
export function resolveCutDate(monthParam: string | undefined): string {
  const today = todayAR();
  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) return today;
  const [year, month] = monthParam.split("-").map(Number);
  if (month < 1 || month > 12) return today;
  const lastDay = ymd(year, month, daysInMonth(year, month));
  return lastDay >= today ? today : lastDay;
}

/** Opciones del selector de período: últimos 24 meses. */
export function monthOptions(): { value: string; label: string }[] {
  const { year, month } = parseYmd(todayAR());
  return Array.from({ length: 24 }, (_, i) => {
    const m = addMonths(year, month, -i);
    return { value: monthKey(m.year, m.month), label: monthLabelLong(m.year, m.month) };
  });
}

/** Rangos de los cuatro períodos para una fecha de corte. */
export function periodRanges(cutDate: string) {
  const { year, month } = parseYmd(cutDate);
  const semesterStartMonth = month <= 6 ? 1 : 7;
  const rolling = addMonths(year, month, -11);
  return {
    mensual: { from: ymd(year, month, 1), to: cutDate },
    semestral: { from: ymd(year, semesterStartMonth, 1), to: cutDate },
    anual: { from: ymd(year, 1, 1), to: cutDate },
    movil12: { from: ymd(rolling.year, rolling.month, 1), to: cutDate },
  };
}

export function coverageFor(coverage: CoverageRow, taxpayerStart: string, from: string, to: string): CoverageState {
  if (!coverage) return "SIN_DATOS";
  // Antes del inicio de actividad no hay nada que facturar: no cuenta como dato faltante.
  const effectiveFrom = taxpayerStart > from ? taxpayerStart : from;
  if (effectiveFrom > to) return "COMPLETA";
  if (coverage.complete && coverage.fromDate <= effectiveFrom) return "COMPLETA";
  if (coverage.fromDate > to) return "SIN_DATOS";
  return "PARCIAL";
}

export function alertLevel(incomeCents: bigint, limitCents: bigint): AlertLevel {
  // Comparaciones exactas en enteros: 80 %, 95 % y 100 % son bordes probados.
  if (incomeCents * 100n < limitCents * 80n) return "NORMAL";
  if (incomeCents * 100n < limitCents * 95n) return "PREVENTIVO";
  if (incomeCents <= limitCents) return "PROXIMO";
  return "SUPERADO";
}

export async function getDashboardData(taxpayer: TaxpayerInput, cutDate: string): Promise<DashboardData> {
  const ranges = periodRanges(cutDate);

  const [coverage, invoices, scaleRow, category] = await Promise.all([
    prisma.dataCoverage.findUnique({ where: { taxpayerId: taxpayer.id } }),
    prisma.invoice.findMany({
      where: {
        taxpayerId: taxpayer.id,
        environment: APP_MODE,
        status: { in: COUNTED_INVOICE_STATUSES },
        issueDate: { gte: ranges.movil12.from, lte: cutDate },
      },
      select: { issueDate: true, amountCents: true },
    }),
    findScaleForDate(taxpayer.studyId, cutDate),
    getCategoryAt(taxpayer, cutDate),
  ]);
  const scale: ScaleInfo | null = scaleRow
    ? {
        id: scaleRow.id,
        name: scaleRow.name,
        status: scaleRow.status,
        source: scaleRow.source,
        validFrom: scaleRow.validFrom,
        validTo: scaleRow.validTo,
        limits: sortedLimits(scaleRow.limits).map((l) => ({ code: l.code, annualLimitCents: l.annualLimitCents })),
      }
    : null;

  const sumRange = (from: string, to: string) => {
    let total = 0n;
    let count = 0;
    for (const inv of invoices) {
      if (inv.issueDate >= from && inv.issueDate <= to) {
        total += inv.amountCents;
        count += 1;
      }
    }
    return { total, count };
  };

  const definitions: { key: PeriodMetric["key"]; label: string; description: string }[] = [
    { key: "mensual", label: "Mes", description: "Mes calendario hasta la fecha de corte" },
    { key: "semestral", label: "Semestre", description: "Semestre calendario (ene–jun o jul–dic)" },
    { key: "anual", label: "Año", description: "Año calendario acumulado" },
    { key: "movil12", label: "Últimos 12 meses", description: "Referencia móvil, no es el cálculo oficial" },
  ];

  const periods: PeriodMetric[] = definitions.map((def) => {
    const { from, to } = ranges[def.key];
    const state = coverageFor(coverage, taxpayer.startDate, from, to);
    const { total, count } = sumRange(from, to);
    return {
      ...def,
      from,
      to,
      totalCents: state === "SIN_DATOS" ? null : total,
      invoiceCount: count,
      coverage: state,
    };
  });

  const { year, month } = parseYmd(cutDate);
  const chart: MonthBar[] = Array.from({ length: 12 }, (_, i) => {
    const m = addMonths(year, month, i - 11);
    const from = ymd(m.year, m.month, 1);
    const lastDay = ymd(m.year, m.month, daysInMonth(m.year, m.month));
    const to = lastDay < cutDate ? lastDay : cutDate;
    return {
      key: monthKey(m.year, m.month),
      label: monthLabelShort(m.year, m.month),
      longLabel: monthLabelLong(m.year, m.month),
      totalCents: sumRange(from, to).total,
      coverage: coverageFor(coverage, taxpayer.startDate, from, to),
    };
  });

  const rolling = periods.find((p) => p.key === "movil12")!;
  const margin = computeMargin(category.code, taxpayer.startDate, rolling, scale);

  return {
    cutDate,
    environment: APP_MODE,
    rulesVersion: RULES_VERSION,
    currency: "ARS",
    periods,
    chart,
    margin,
    category: { code: category.code, since: category.since, scale, suggestion: suggestCategory(taxpayer.startDate, rolling, scale) },
    coverage: coverage
      ? { source: coverage.source, fromDate: coverage.fromDate, complete: coverage.complete, updatedAt: coverage.updatedAt }
      : null,
  };
}

export function computeMargin(
  categoryCode: string | null,
  startDate: string,
  rolling: PeriodMetric,
  scale: ScaleInfo | null,
): MarginInfo {
  if (!categoryCode) {
    return { available: false, categoryCode: null, reason: "No hay una categoría registrada a la fecha de corte. El estudio debe cargarla." };
  }
  if (!scale) {
    return { available: false, categoryCode, reason: "No hay una escala de categorías vigente para la fecha de corte." };
  }
  const limit = scale.limits.find((l) => l.code === categoryCode);
  if (!limit || limit.annualLimitCents <= 0n) {
    return { available: false, categoryCode, reason: `La escala vigente no tiene un límite para la categoría ${categoryCode}.` };
  }
  if (rolling.coverage !== "COMPLETA" || rolling.totalCents === null) {
    return {
      available: false,
      categoryCode,
      reason: "Información incompleta: faltan datos de los últimos 12 meses, así que no se puede calcular el margen.",
    };
  }

  const income = rolling.totalCents;
  const note =
    startDate > rolling.from
      ? "La actividad empezó hace menos de 12 meses: el margen es solo orientativo. Consultá con el estudio."
      : null;

  return {
    available: true,
    categoryCode,
    scaleName: scale.name,
    scaleStatus: scale.status,
    referenceFrom: rolling.from,
    referenceTo: rolling.to,
    limitCents: limit.annualLimitCents,
    incomeCents: income,
    marginCents: limit.annualLimitCents - income,
    percentTenths: percentTenths(income, limit.annualLimitCents),
    level: alertLevel(income, limit.annualLimitCents),
    note,
  };
}

/**
 * Categoría orientativa por ingresos: la menor categoría de la escala cuyo límite cubre los ingresos de 12 meses.
 * Si falta historial, la actividad es reciente o no hay escala, no se sugiere nada (no se anualiza).
 */
export function suggestCategory(startDate: string, rolling: PeriodMetric, scale: ScaleInfo | null): CategorySuggestion {
  if (!scale || scale.limits.length === 0) {
    return { available: false, reason: "No hay una escala vigente a la fecha de corte." };
  }
  if (rolling.coverage !== "COMPLETA" || rolling.totalCents === null) {
    return { available: false, reason: "Faltan datos de los últimos 12 meses." };
  }
  if (startDate > rolling.from) {
    return { available: false, reason: "La actividad tiene menos de 12 meses: no hay historial suficiente." };
  }
  const income = rolling.totalCents;
  const fit = scale.limits.find((l) => income <= l.annualLimitCents);
  return { available: true, code: fit?.code ?? null, aboveTop: !fit };
}

/** Movimientos de un contribuyente en un rango (incluye borradores y rechazos, marcados). */
export async function getInvoices(taxpayerId: string, from: string, to: string) {
  return prisma.invoice.findMany({
    where: { taxpayerId, environment: APP_MODE, issueDate: { gte: from, lte: to } },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
  });
}

/** Cobertura de datos de un rango cualquiera (para explicar el detalle de movimientos). */
export async function rangeCoverage(taxpayer: { id: string; startDate: string }, from: string, to: string): Promise<CoverageState> {
  const coverage = await prisma.dataCoverage.findUnique({ where: { taxpayerId: taxpayer.id } });
  return coverageFor(coverage, taxpayer.startDate, from, to);
}
