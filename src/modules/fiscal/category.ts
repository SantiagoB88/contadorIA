import { prisma } from "@/lib/db";
import { CATEGORY_CODES, ROLES } from "@/lib/constants";
import { formatDateAR, isValidYmd, todayAR } from "@/lib/dates";
import type { CurrentUser } from "@/lib/auth";
import type { ServiceResult } from "@/modules/access/service";
import { findScaleForDate } from "./scales";

// Categoría registrada con vigencias. La carga el estudio; el sistema nunca la cambia por su cuenta.

type HistoryRow = { code: string | null; validFrom: string; createdAt: Date };

/** La fila que rige en una fecha: la de mayor `validFrom` hasta esa fecha (a igual fecha, la última cargada). */
function rowAt<T extends HistoryRow>(rows: T[], date: string): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (row.validFrom > date) continue;
    if (!best || row.validFrom > best.validFrom || (row.validFrom === best.validFrom && row.createdAt > best.createdAt)) {
      best = row;
    }
  }
  return best;
}

export type CategoryAt = { code: string | null; since: string | null };

/**
 * Categoría registrada en una fecha. Sin historial (datos anteriores a la entrega 4) se usa la categoría actual.
 */
export async function getCategoryAt(
  taxpayer: { id: string; categoryCode: string | null; startDate: string },
  date: string,
): Promise<CategoryAt> {
  const rows = await prisma.categoryHistory.findMany({ where: { taxpayerId: taxpayer.id } });
  if (rows.length === 0) return { code: taxpayer.categoryCode, since: null };
  const row = rowAt(rows, date);
  return row ? { code: row.code, since: row.validFrom } : { code: null, since: null };
}

export async function getCategoryHistory(taxpayerId: string) {
  return prisma.categoryHistory.findMany({
    where: { taxpayerId },
    orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * Registra un cambio de categoría que rige desde `validFrom`. Actualiza la categoría actual del contribuyente
 * con la que corresponda a hoy. Queda en el historial y en la auditoría.
 */
export async function setCategory(
  admin: CurrentUser,
  taxpayerId: string,
  codeInput: string,
  validFrom: string,
  reasonInput: string,
): Promise<ServiceResult> {
  if (admin.role !== ROLES.ADMIN) throw new Error("Solo un administrador puede hacer esto.");
  const taxpayer = await prisma.taxpayer.findFirst({ where: { id: taxpayerId, studyId: admin.studyId } });
  if (!taxpayer) return { ok: false, message: "No encontramos el contribuyente en tu estudio." };

  const code = codeInput.trim().toUpperCase();
  const reason = reasonInput.trim();
  const today = todayAR();
  const fieldErrors: Record<string, string> = {};

  if (code !== "" && !(CATEGORY_CODES as readonly string[]).includes(code)) fieldErrors.categoryCode = "Elegí una categoría válida.";
  if (!isValidYmd(validFrom)) fieldErrors.validFrom = "Ingresá una fecha válida.";
  else if (validFrom > today) fieldErrors.validFrom = "La fecha no puede ser futura.";
  else if (validFrom < taxpayer.startDate) {
    fieldErrors.validFrom = `No puede ser anterior al inicio de actividad (${formatDateAR(taxpayer.startDate)}).`;
  }
  if (reason.length < 3) fieldErrors.reason = "Indicá el motivo del cambio (queda en la auditoría).";
  if (reason.length > 300) fieldErrors.reason = "Máximo 300 caracteres.";

  if (!fieldErrors.categoryCode && !fieldErrors.validFrom && code !== "") {
    const scale = await findScaleForDate(admin.studyId, validFrom);
    if (!scale) fieldErrors.validFrom = "No hay una escala vigente en esa fecha. Cargala primero en Escalas.";
    else if (!scale.limits.some((l) => l.code === code)) {
      fieldErrors.categoryCode = `La escala vigente en esa fecha ("${scale.name}") no tiene la categoría ${code}.`;
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, message: "Revisá los campos marcados.", fieldErrors };

  const newCode = code === "" ? null : code;
  const rows = await prisma.categoryHistory.findMany({ where: { taxpayerId: taxpayer.id } });
  const inEffect = rows.length === 0 ? taxpayer.categoryCode : (rowAt(rows, validFrom)?.code ?? null);
  if (inEffect === newCode) {
    return { ok: false, message: `En esa fecha ya rige ${newCode ? `la categoría ${newCode}` : "“sin categoría”"}.` };
  }

  const current = await prisma.$transaction(async (tx) => {
    // Primer cambio sobre datos viejos: se guarda la categoría que tenía como punto de partida.
    if (rows.length === 0 && taxpayer.categoryCode) {
      await tx.categoryHistory.create({
        data: {
          taxpayerId: taxpayer.id,
          code: taxpayer.categoryCode,
          validFrom: taxpayer.startDate,
          reason: "Categoría registrada antes del historial",
          createdById: admin.id,
        },
      });
    }
    await tx.categoryHistory.create({
      data: { taxpayerId: taxpayer.id, code: newCode, validFrom, reason, createdById: admin.id },
    });
    const all = await tx.categoryHistory.findMany({ where: { taxpayerId: taxpayer.id } });
    const currentCode = rowAt(all, today)?.code ?? null;
    await tx.taxpayer.update({ where: { id: taxpayer.id }, data: { categoryCode: currentCode } });
    await tx.auditEvent.create({
      data: {
        studyId: admin.studyId,
        actorId: admin.id,
        action: "CATEGORY_UPDATE",
        entity: "Taxpayer",
        entityId: taxpayer.id,
        detail: `${taxpayer.name}: ${inEffect ?? "sin categoría"} → ${newCode ?? "sin categoría"} desde el ${formatDateAR(validFrom)}. Motivo: ${reason}`,
      },
    });
    return currentCode;
  });

  return {
    ok: true,
    message: `Categoría ${newCode ?? "“sin categoría”"} registrada desde el ${formatDateAR(validFrom)}. Categoría actual: ${current ?? "sin categoría"}.`,
  };
}
