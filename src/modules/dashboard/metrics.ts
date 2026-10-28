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

// Servicio común de indicadores. Todo se calcula en el servidor; las pantallas solo muestran.
// Versión de reglas que se informa junto con cada respuesta.
export const RULES_VERSION = "demo-2026.10-v1";

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

export type MarginInfo =
  | {
      available: true;
      categoryCode: string;
      scaleName: string;
      scaleStatus: string;
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
  coverage: { source: string; fromDate: string; complete: boolean; updatedAt: Date } | null;
};

type TaxpayerInput = { id: string; categoryCode: string | null; startDate: string };
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

function coverageFor(coverage: CoverageRow, taxpayerStart: string, from: string, to: string): CoverageState {
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

  const [coverage, invoices, scale] = await Promise.all([
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
    prisma.taxScaleVersion.findFirst({
      where: { validFrom: { lte: cutDate }, OR: [{ validTo: null }, { validTo: { gte: cutDate } }] },
      orderBy: { validFrom: "desc" },
      include: { limits: true },
    }),
  ]);

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
  const margin = computeMargin(taxpayer, rolling, scale);

  return {
    cutDate,
    environment: APP_MODE,
    rulesVersion: RULES_VERSION,
    currency: "ARS",
    periods,
    chart,
    margin,
    coverage: coverage
      ? { source: coverage.source, fromDate: coverage.fromDate, complete: coverage.complete, updatedAt: coverage.updatedAt }
      : null,
  };
}

type ScaleWithLimits = {
  name: string;
  status: string;
  limits: { code: string; annualLimitCents: bigint }[];
} | null;

function computeMargin(taxpayer: TaxpayerInput, rolling: PeriodMetric, scale: ScaleWithLimits): MarginInfo {
  const categoryCode = taxpayer.categoryCode;
  if (!categoryCode) {
    return { available: false, categoryCode: null, reason: "No hay una categoría registrada. El estudio debe cargarla." };
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
    taxpayer.startDate > rolling.from
      ? "La actividad empezó hace menos de 12 meses: el margen es solo orientativo. Consultá con el estudio."
      : null;

  return {
    available: true,
    categoryCode,
    scaleName: scale.name,
    scaleStatus: scale.status,
    limitCents: limit.annualLimitCents,
    incomeCents: income,
    marginCents: limit.annualLimitCents - income,
    percentTenths: percentTenths(income, limit.annualLimitCents),
    level: alertLevel(income, limit.annualLimitCents),
    note,
  };
}

/** Movimientos de un contribuyente en un rango (incluye borradores y rechazos, marcados). */
export async function getInvoices(taxpayerId: string, from: string, to: string) {
  return prisma.invoice.findMany({
    where: { taxpayerId, environment: APP_MODE, issueDate: { gte: from, lte: to } },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
  });
}
