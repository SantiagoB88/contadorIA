import { prisma } from "@/lib/db";
import { DEBT_REVIEW_STATUS, OBLIGATION_STATUS, OBLIGATION_STATUS_LABEL, ROLES, STUDY_SOURCE } from "@/lib/constants";
import { formatARS, parseAmountToCents } from "@/lib/money";
import { addDaysYmd, formatDateAR, isValidYmd, todayAR } from "@/lib/dates";
import type { CurrentUser } from "@/lib/auth";
import type { ServiceResult } from "@/modules/access/service";

// Deudas y vencimientos cargados por el estudio. No hay consulta automática a ARCA:
// una lista vacía nunca significa "sin deuda"; eso solo lo dice una revisión del estudio con fecha.

const MAX_AMOUNT_CENTS = 100_000_000_000n; // $ 1.000 millones
const STATUS_VALUES: string[] = Object.values(OBLIGATION_STATUS);

export type ObligationInput = {
  concept: string;
  period: string; // YYYY-MM
  dueDate: string;
  amount: string; // "" = importe no informado
};

export type DebtState = "SIN_DATOS" | "PENDIENTE_REVISION" | "DEUDA_INFORMADA" | "SIN_DEUDA_INFORMADA";

type ObligationRow = {
  id: string;
  concept: string;
  period: string;
  dueDate: string;
  amountCents: bigint | null;
  currency: string;
  status: string;
  statusNote: string | null;
  source: string;
  updatedAt: Date;
};

export type DebtSummary = {
  state: DebtState;
  today: string;
  review: { asOfDate: string; status: string; note: string | null; source: string; updatedAt: Date } | null;
  overdue: ObligationRow[]; // pendientes con vencimiento anterior a hoy
  overdueTotalCents: bigint; // solo las que tienen importe
  overdueWithoutAmount: number;
  paymentInformed: ObligationRow[]; // pago informado, falta que el estudio lo verifique
  upcoming: ObligationRow[]; // pendientes que vencen hoy o después (no son deuda vencida)
  all: ObligationRow[];
};

export async function getDebtSummary(taxpayerId: string, today: string = todayAR()): Promise<DebtSummary> {
  const [rows, review] = await Promise.all([
    prisma.obligation.findMany({ where: { taxpayerId }, orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }] }),
    prisma.debtReview.findUnique({ where: { taxpayerId } }),
  ]);

  const pending = rows.filter((o) => o.status === OBLIGATION_STATUS.PENDIENTE);
  const overdue = pending.filter((o) => o.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const upcoming = pending.filter((o) => o.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paymentInformed = rows.filter((o) => o.status === OBLIGATION_STATUS.PAGO_INFORMADO);
  const overdueTotalCents = overdue.reduce((acc, o) => acc + (o.amountCents ?? 0n), 0n);
  const overdueWithoutAmount = overdue.filter((o) => o.amountCents === null).length;

  let state: DebtState;
  if (!review) state = rows.length === 0 ? "SIN_DATOS" : "PENDIENTE_REVISION";
  else if (review.status === DEBT_REVIEW_STATUS.PENDIENTE_REVISION) state = "PENDIENTE_REVISION";
  else if (overdue.length > 0) state = "DEUDA_INFORMADA";
  else if (paymentInformed.length > 0) state = "PENDIENTE_REVISION";
  else state = "SIN_DEUDA_INFORMADA";

  return {
    state,
    today,
    review: review
      ? { asOfDate: review.asOfDate, status: review.status, note: review.note, source: review.source, updatedAt: review.updatedAt }
      : null,
    overdue,
    overdueTotalCents,
    overdueWithoutAmount,
    paymentInformed,
    upcoming,
    all: rows,
  };
}

function assertAdmin(user: CurrentUser) {
  if (user.role !== ROLES.ADMIN) throw new Error("Solo un administrador puede hacer esto.");
}

async function studyTaxpayer(admin: CurrentUser, taxpayerId: string) {
  return prisma.taxpayer.findFirst({ where: { id: taxpayerId, studyId: admin.studyId } });
}

export async function createObligation(admin: CurrentUser, taxpayerId: string, input: ObligationInput): Promise<ServiceResult> {
  assertAdmin(admin);
  const taxpayer = await studyTaxpayer(admin, taxpayerId);
  if (!taxpayer) return { ok: false, message: "No encontramos el contribuyente en tu estudio." };

  const concept = input.concept.trim();
  const amountRaw = input.amount.trim();
  const fieldErrors: Record<string, string> = {};
  if (concept.length < 2 || concept.length > 120) fieldErrors.concept = "Ingresá el concepto (2 a 120 caracteres).";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) fieldErrors.period = "Ingresá el período (mes y año).";
  if (!isValidYmd(input.dueDate)) fieldErrors.dueDate = "Ingresá una fecha válida.";
  else if (input.dueDate > addDaysYmd(todayAR(), 730)) fieldErrors.dueDate = "La fecha está demasiado lejos.";
  let amountCents: bigint | null = null;
  if (amountRaw !== "") {
    amountCents = parseAmountToCents(amountRaw);
    if (amountCents === null) fieldErrors.amount = "Ingresá un importe válido o dejalo vacío si no se conoce.";
    else if (amountCents <= 0n) fieldErrors.amount = "El importe tiene que ser mayor a cero.";
    else if (amountCents > MAX_AMOUNT_CENTS) fieldErrors.amount = "El importe es demasiado alto.";
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, message: "Revisá los campos marcados.", fieldErrors };

  const obligation = await prisma.obligation.create({
    data: {
      studyId: admin.studyId,
      taxpayerId: taxpayer.id,
      concept,
      period: input.period,
      dueDate: input.dueDate,
      amountCents,
      status: OBLIGATION_STATUS.PENDIENTE,
      source: STUDY_SOURCE,
      createdById: admin.id,
      updatedById: admin.id,
    },
  });
  await prisma.auditEvent.create({
    data: {
      studyId: admin.studyId,
      actorId: admin.id,
      action: "OBLIGATION_CREATE",
      entity: "Obligation",
      entityId: obligation.id,
      detail: `${taxpayer.name}: ${concept} ${input.period}, vence ${formatDateAR(input.dueDate)}, ${
        amountCents === null ? "sin importe" : formatARS(amountCents)
      }`,
    },
  });
  return { ok: true, message: "Vencimiento cargado." };
}

/** Cambia el estado de pago. Informar, verificar o anular exige una nota con la evidencia o el motivo. */
export async function updateObligationStatus(
  admin: CurrentUser,
  obligationId: string,
  status: string,
  noteInput: string,
): Promise<ServiceResult> {
  assertAdmin(admin);
  const obligation = await prisma.obligation.findFirst({
    where: { id: obligationId, studyId: admin.studyId },
    include: { taxpayer: true },
  });
  if (!obligation) return { ok: false, message: "El vencimiento no existe en tu estudio." };

  const note = noteInput.trim();
  const fieldErrors: Record<string, string> = {};
  if (!STATUS_VALUES.includes(status)) fieldErrors.status = "Elegí un estado.";
  if (status !== OBLIGATION_STATUS.PENDIENTE && note.length < 3) {
    fieldErrors.note = "Indicá la evidencia o el motivo (por ejemplo, el comprobante de pago recibido).";
  }
  if (note.length > 300) fieldErrors.note = "Máximo 300 caracteres.";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, message: "Revisá los campos marcados.", fieldErrors };
  if (status === obligation.status) return { ok: false, message: "El vencimiento ya tiene ese estado." };

  await prisma.obligation.update({
    where: { id: obligation.id },
    data: { status, statusNote: note || null, updatedById: admin.id },
  });
  await prisma.auditEvent.create({
    data: {
      studyId: admin.studyId,
      actorId: admin.id,
      action: "OBLIGATION_STATUS",
      entity: "Obligation",
      entityId: obligation.id,
      detail: `${obligation.taxpayer.name}: ${obligation.concept} ${obligation.period} · ${
        OBLIGATION_STATUS_LABEL[obligation.status] ?? obligation.status
      } → ${OBLIGATION_STATUS_LABEL[status] ?? status}${note ? `. ${note}` : ""}`,
    },
  });
  return { ok: true, message: `Estado actualizado: ${OBLIGATION_STATUS_LABEL[status] ?? status}.` };
}

/** Registra a qué fecha el estudio revisó la deuda del contribuyente. */
export async function recordDebtReview(
  admin: CurrentUser,
  taxpayerId: string,
  asOfDate: string,
  status: string,
  noteInput: string,
): Promise<ServiceResult> {
  assertAdmin(admin);
  const taxpayer = await studyTaxpayer(admin, taxpayerId);
  if (!taxpayer) return { ok: false, message: "No encontramos el contribuyente en tu estudio." };

  const note = noteInput.trim();
  const fieldErrors: Record<string, string> = {};
  if (!isValidYmd(asOfDate) || asOfDate > todayAR()) fieldErrors.asOfDate = "Ingresá una fecha válida y no futura.";
  if (status !== DEBT_REVIEW_STATUS.REVISADA && status !== DEBT_REVIEW_STATUS.PENDIENTE_REVISION) {
    fieldErrors.reviewStatus = "Elegí un estado.";
  }
  if (note.length > 300) fieldErrors.reviewNote = "Máximo 300 caracteres.";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, message: "Revisá los campos marcados.", fieldErrors };

  await prisma.debtReview.upsert({
    where: { taxpayerId: taxpayer.id },
    update: { asOfDate, status, note: note || null, source: STUDY_SOURCE, reviewedById: admin.id },
    create: { taxpayerId: taxpayer.id, asOfDate, status, note: note || null, source: STUDY_SOURCE, reviewedById: admin.id },
  });
  await prisma.auditEvent.create({
    data: {
      studyId: admin.studyId,
      actorId: admin.id,
      action: "DEBT_REVIEW",
      entity: "Taxpayer",
      entityId: taxpayer.id,
      detail: `${taxpayer.name}: deuda ${status === DEBT_REVIEW_STATUS.REVISADA ? "revisada" : "pendiente de revisión"} al ${formatDateAR(asOfDate)}`,
    },
  });
  return { ok: true, message: "Revisión de deuda registrada." };
}
