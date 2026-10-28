import { prisma } from "@/lib/db";
import { CATEGORY_CODES, ROLES, SCALE_STATUS } from "@/lib/constants";
import { formatARS, parseAmountToCents } from "@/lib/money";
import { addDaysYmd, formatDateAR, isValidYmd } from "@/lib/dates";
import type { CurrentUser } from "@/lib/auth";
import type { ServiceResult } from "@/modules/access/service";

// Escalas de categorías versionadas por estudio. Sin dependencias de Next (se prueba con `npm run verify`).

const OPEN_END = "9999-12-31";
const MAX_LIMIT_CENTS = 100_000_000_000_00n; // $ 100.000 millones

export type ScaleInput = {
  name: string;
  source: string;
  status: string;
  validFrom: string;
  validTo: string; // "" = sin fecha de fin
  limits: Record<string, string>; // código → importe tal como lo escribió el usuario ("" = categoría fuera de la escala)
};

export type ScaleResult = (ServiceResult & { ok: true; scaleId: string }) | (ServiceResult & { ok: false });

/** Escala que rige en una fecha para un estudio. Si hubiera más de una, se prefiere la VALIDADA. */
export async function findScaleForDate(studyId: string, date: string) {
  const candidates = await prisma.taxScaleVersion.findMany({
    where: { studyId, validFrom: { lte: date }, OR: [{ validTo: null }, { validTo: { gte: date } }] },
    include: { limits: true },
    orderBy: { validFrom: "desc" },
  });
  return candidates.find((s) => s.status === SCALE_STATUS.VALIDADA) ?? candidates[0] ?? null;
}

export async function listScales(studyId: string) {
  return prisma.taxScaleVersion.findMany({
    where: { studyId },
    include: { limits: true },
    orderBy: { validFrom: "desc" },
  });
}

export async function getStudyScale(studyId: string, scaleId: string) {
  return prisma.taxScaleVersion.findFirst({ where: { id: scaleId, studyId }, include: { limits: true } });
}

/** Límites ordenados por el orden de las categorías (A, B, C…). */
export function sortedLimits<T extends { code: string }>(limits: T[]): T[] {
  const order = (code: string) => {
    const i = (CATEGORY_CODES as readonly string[]).indexOf(code);
    return i === -1 ? 999 : i;
  };
  return [...limits].sort((a, b) => order(a.code) - order(b.code) || a.code.localeCompare(b.code));
}

type ValidScale = {
  name: string;
  source: string;
  status: string;
  validFrom: string;
  validTo: string | null;
  limits: { code: string; annualLimitCents: bigint }[];
};

function validateScale(input: ScaleInput): { data: ValidScale } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  const source = input.source.trim();
  const validTo = input.validTo.trim();

  if (name.length < 3 || name.length > 120) errors.name = "Ingresá un nombre (3 a 120 caracteres).";
  if (input.status !== SCALE_STATUS.DEMO && input.status !== SCALE_STATUS.VALIDADA) errors.status = "Elegí un estado.";
  if (source.length < 3 || source.length > 300) errors.source = "Indicá la fuente (3 a 300 caracteres).";
  else if (input.status === SCALE_STATUS.VALIDADA && source.length < 10) {
    errors.source = "Una escala validada necesita una fuente concreta (norma, publicación o enlace).";
  }
  if (!isValidYmd(input.validFrom)) errors.validFrom = "Ingresá una fecha válida.";
  if (validTo !== "" && !isValidYmd(validTo)) errors.validTo = "Ingresá una fecha válida o dejala vacía.";
  else if (validTo !== "" && isValidYmd(input.validFrom) && validTo < input.validFrom) {
    errors.validTo = "La fecha de fin no puede ser anterior a la de inicio.";
  }

  const limits: { code: string; annualLimitCents: bigint }[] = [];
  for (const code of CATEGORY_CODES) {
    const raw = (input.limits[code] ?? "").trim();
    if (raw === "") continue;
    const cents = parseAmountToCents(raw);
    if (cents === null) errors[`limit-${code}`] = "Importe inválido.";
    else if (cents <= 0n) errors[`limit-${code}`] = "Tiene que ser mayor a cero.";
    else if (cents > MAX_LIMIT_CENTS) errors[`limit-${code}`] = "Importe demasiado alto.";
    else limits.push({ code, annualLimitCents: cents });
  }
  if (limits.length === 0 && !Object.keys(errors).some((k) => k.startsWith("limit-"))) {
    errors.limits = "Cargá al menos el límite de una categoría.";
  }
  // Cada categoría tiene que tener un límite mayor que la anterior.
  for (let i = 1; i < limits.length; i++) {
    if (limits[i].annualLimitCents <= limits[i - 1].annualLimitCents) {
      errors[`limit-${limits[i].code}`] =
        `Tiene que ser mayor que el de la categoría ${limits[i - 1].code} (${formatARS(limits[i - 1].annualLimitCents)}).`;
    }
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { data: { name, source, status: input.status, validFrom: input.validFrom, validTo: validTo || null, limits } };
}

function overlaps(a: { validFrom: string; validTo: string | null }, b: { validFrom: string; validTo: string | null }) {
  return a.validFrom <= (b.validTo ?? OPEN_END) && b.validFrom <= (a.validTo ?? OPEN_END);
}

function describeRange(s: { validFrom: string; validTo: string | null }) {
  return s.validTo ? `del ${formatDateAR(s.validFrom)} al ${formatDateAR(s.validTo)}` : `desde el ${formatDateAR(s.validFrom)}`;
}

function assertAdmin(user: CurrentUser) {
  if (user.role !== ROLES.ADMIN) throw new Error("Solo un administrador puede hacer esto.");
}

/**
 * Crea una versión nueva. Si la nueva no tiene fecha de fin y la única superposición es con la versión abierta
 * que empezó antes, esa versión se cierra el día anterior: así se carga una escala nueva sin editar la vieja a mano.
 * Una versión con fecha de fin nunca cierra a otra: dejaría días sin escala después de esa fecha.
 */
export async function createScaleVersion(admin: CurrentUser, input: ScaleInput): Promise<ScaleResult> {
  assertAdmin(admin);
  const checked = validateScale(input);
  if ("errors" in checked) return { ok: false, message: "Revisá los campos marcados.", fieldErrors: checked.errors };
  const data = checked.data;

  const others = await prisma.taxScaleVersion.findMany({ where: { studyId: admin.studyId } });
  const clashing = others.filter((o) => overlaps(o, data));
  const replacesOpen = clashing.length === 1 && clashing[0].validTo === null && clashing[0].validFrom < data.validFrom;
  const toClose = replacesOpen && data.validTo === null ? clashing[0] : null;
  if (clashing.length > 0 && !toClose) {
    const c = clashing[0];
    const hint = replacesOpen ? " Para que la reemplace desde esa fecha, dejá vacía la fecha de fin." : "";
    return {
      ok: false,
      message: "Revisá los campos marcados.",
      fieldErrors: { validFrom: `Se superpone con "${c.name}", vigente ${describeRange(c)}.${hint}` },
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    if (toClose) {
      await tx.taxScaleVersion.update({ where: { id: toClose.id }, data: { validTo: addDaysYmd(data.validFrom, -1) } });
    }
    const scale = await tx.taxScaleVersion.create({
      data: {
        studyId: admin.studyId,
        name: data.name,
        source: data.source,
        status: data.status,
        validFrom: data.validFrom,
        validTo: data.validTo,
        createdById: admin.id,
        limits: { create: data.limits },
      },
    });
    await tx.auditEvent.create({
      data: {
        studyId: admin.studyId,
        actorId: admin.id,
        action: "SCALE_CREATE",
        entity: "TaxScaleVersion",
        entityId: scale.id,
        detail:
          `${data.name} (${data.status}) ${describeRange(data)}` +
          (toClose ? `. Se cerró "${toClose.name}" al ${formatDateAR(addDaysYmd(data.validFrom, -1))}` : ""),
      },
    });
    return scale;
  });

  return {
    ok: true,
    scaleId: created.id,
    message: toClose
      ? `Escala creada. "${toClose.name}" quedó vigente hasta el ${formatDateAR(addDaysYmd(data.validFrom, -1))}.`
      : "Escala creada.",
  };
}

/** Edita una versión. Exige motivo: cambia los cálculos de todas las fechas que cubre. */
export async function updateScaleVersion(
  admin: CurrentUser,
  scaleId: string,
  input: ScaleInput,
  reasonInput: string,
): Promise<ScaleResult> {
  assertAdmin(admin);
  const scale = await getStudyScale(admin.studyId, scaleId);
  if (!scale) return { ok: false, message: "La escala no existe en tu estudio." };

  const checked = validateScale(input);
  const reason = reasonInput.trim();
  const errors = "errors" in checked ? { ...checked.errors } : {};
  if (reason.length < 3 || reason.length > 300) errors.reason = "Indicá el motivo del cambio (queda en la auditoría).";
  if ("errors" in checked || Object.keys(errors).length > 0) {
    return { ok: false, message: "Revisá los campos marcados.", fieldErrors: errors };
  }
  const data = checked.data;

  const others = await prisma.taxScaleVersion.findMany({ where: { studyId: admin.studyId, id: { not: scale.id } } });
  const clash = others.find((o) => overlaps(o, data));
  if (clash) {
    return {
      ok: false,
      message: "Revisá los campos marcados.",
      fieldErrors: { validFrom: `Se superpone con "${clash.name}", vigente ${describeRange(clash)}.` },
    };
  }

  const before = sortedLimits(scale.limits)
    .map((l) => `${l.code} ${formatARS(l.annualLimitCents)}`)
    .join(", ");
  await prisma.$transaction(async (tx) => {
    await tx.taxCategoryLimit.deleteMany({ where: { scaleVersionId: scale.id } });
    await tx.taxScaleVersion.update({
      where: { id: scale.id },
      data: {
        name: data.name,
        source: data.source,
        status: data.status,
        validFrom: data.validFrom,
        validTo: data.validTo,
        limits: { create: data.limits },
      },
    });
    await tx.auditEvent.create({
      data: {
        studyId: admin.studyId,
        actorId: admin.id,
        action: "SCALE_UPDATE",
        entity: "TaxScaleVersion",
        entityId: scale.id,
        detail: `${data.name} (${data.status}) ${describeRange(data)}. Motivo: ${reason}. Límites anteriores: ${before}`.slice(0, 1000),
      },
    });
  });

  return { ok: true, scaleId: scale.id, message: "Escala actualizada. Los indicadores ya usan los valores nuevos." };
}
