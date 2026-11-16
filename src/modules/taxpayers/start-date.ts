import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ROLES } from "@/lib/constants";
import { formatDateAR, isValidYmd, todayAR } from "@/lib/dates";
import type { CurrentUser } from "@/lib/auth";
import { getAuthorizedTaxpayer } from "./access";

// Fecha de inicio de actividad. No se pide en el alta (pedido del estudio después del primer testing): se completa
// cuando hace falta (por ejemplo, para emitir, porque va impresa en la factura) o cuando la persona quiera.
// - El cliente puede cargarla solo si falta (es un dato que declara; si ya está, la corrige el estudio).
// - El estudio puede cargarla o corregirla siempre.
// Nunca se completa sola con una fecha supuesta.

export type StartDateResult = { ok: true; message: string } | { ok: false; message: string; fieldErrors?: Record<string, string> };

const MIN_DATE = "1990-01-01";

/** Interpreta "dd/mm/aaaa" (también con - o .) o "aaaa-mm-dd". Devuelve YYYY-MM-DD o null. */
export function parseStartDate(text: string): string | null {
  const t = text.trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const ar = t.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})$/);
  const value = iso ? t : ar ? `${ar[3]}-${ar[2].padStart(2, "0")}-${ar[1].padStart(2, "0")}` : null;
  return value && isValidYmd(value) ? value : null;
}

/** Problema con la fecha (formato, futura o demasiado vieja), o null si sirve. */
export function startDateProblem(value: string | null): string | null {
  if (!value) return "Escribí la fecha completa, por ejemplo 15/03/2022.";
  if (value > todayAR()) return "La fecha no puede ser futura.";
  if (value < MIN_DATE) return "Revisá el año: la fecha parece demasiado antigua.";
  return null;
}

export async function setStartDate(user: CurrentUser, taxpayerId: string, raw: string): Promise<StartDateResult> {
  const taxpayer = await getAuthorizedTaxpayer(user, taxpayerId);
  if (!taxpayer) return { ok: false, message: "No tenés acceso a ese contribuyente." };
  const isStaff = user.role === ROLES.ADMIN;
  if (taxpayer.startDate && !isStaff) {
    return { ok: false, message: "La fecha de inicio ya está cargada. Si no es correcta, pedile al estudio que la corrija." };
  }
  const value = parseStartDate(raw);
  const problem = startDateProblem(value);
  if (problem) return { ok: false, message: "Revisá la fecha.", fieldErrors: { startDate: problem } };

  // Facturas cargadas antes de esa fecha: no se acepta (el dato y los comprobantes quedarían en contradicción).
  const earlier = await prisma.invoice.findFirst({
    where: { taxpayerId: taxpayer.id, issueDate: { lt: value! } },
    orderBy: { issueDate: "asc" },
    select: { issueDate: true },
  });
  if (earlier) {
    return {
      ok: false,
      message: "Revisá la fecha.",
      fieldErrors: { startDate: `Hay comprobantes del ${formatDateAR(earlier.issueDate)}: el inicio no puede ser posterior.` },
    };
  }

  await prisma.taxpayer.update({ where: { id: taxpayer.id }, data: { startDate: value } });
  await audit({
    studyId: taxpayer.studyId,
    actorId: user.id,
    action: "TAXPAYER_START_DATE",
    entity: "Taxpayer",
    entityId: taxpayer.id,
    detail: `${taxpayer.startDate ? `${taxpayer.startDate} → ` : ""}${value}`,
  });
  return { ok: true, message: `Listo: inicio de actividad ${formatDateAR(value!)}.` };
}
