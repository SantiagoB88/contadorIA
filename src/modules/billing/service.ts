import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  APP_MODE,
  DEMO_POINT_OF_SALE,
  INVOICE_SOURCE,
  INVOICE_STATUS,
  MONOTRIBUTO_INVOICE_TYPE,
  STATUS_LABEL,
} from "@/lib/constants";
import { isValidCuit, normalizeCuit } from "@/lib/cuit";
import { addDaysYmd, formatDateAR, isValidYmd, todayAR } from "@/lib/dates";
import { formatARS, lineSubtotalCents, parseAmountToCents, parseQuantityMilli } from "@/lib/money";
import type { CurrentUser } from "@/lib/auth";
import { getAuthorizedTaxpayer } from "@/modules/taxpayers/access";
import { getInvoiceProvider, type IssueResult } from "@/providers/invoice";

// Facturador propio. Todo el cálculo y las reglas viven acá; las pantallas solo muestran.
// Sin dependencias de Next, para poder probarlo con `npm run verify`.

export const MAX_ITEMS = 20;
export const MAX_DAYS_BACK = 10; // la fecha del comprobante puede ser hasta 10 días anterior a hoy
const MAX_TOTAL_CENTS = 100_000_000_000n; // $ 1.000 millones
const DOC_TYPES = ["CUIT", "DNI", "SIN_IDENTIFICAR"];
const TAX_CONDITIONS = ["CONSUMIDOR_FINAL", "RESPONSABLE_INSCRIPTO", "MONOTRIBUTO", "EXENTO"];

export type DraftItemInput = { description: string; quantity: string; unitPrice: string };

export type DraftInput = {
  issueDate: string;
  recipientMode: "existente" | "nuevo";
  recipientId: string;
  recipientName: string;
  docType: string;
  docNumber: string;
  taxCondition: string;
  saveRecipient: boolean;
  items: DraftItemInput[];
};

export type BillingResult =
  | { ok: true; message: string; invoiceId?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export function formatInvoiceNumber(type: string | null, pointOfSale: number | null, number: number | null): string {
  if (!type || pointOfSale === null || number === null) return "Sin número";
  return `${type} ${String(pointOfSale).padStart(5, "0")}-${String(number).padStart(8, "0")}`;
}

/** Factura del estudio del usuario y de un contribuyente al que tiene acceso hoy. Si no, null. */
export async function getAuthorizedInvoice(user: CurrentUser, invoiceId: string) {
  if (!invoiceId) return null;
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, studyId: user.studyId, environment: APP_MODE },
    include: { items: { orderBy: { position: "asc" } }, taxpayer: true },
  });
  if (!invoice) return null;
  const taxpayer = await getAuthorizedTaxpayer(user, invoice.taxpayerId);
  return taxpayer ? invoice : null;
}

function dateProblem(issueDate: string, taxpayerStart: string): string | null {
  const today = todayAR();
  if (!isValidYmd(issueDate)) return "Ingresá una fecha válida.";
  if (issueDate > today) return "La fecha no puede ser futura.";
  if (issueDate < addDaysYmd(today, -MAX_DAYS_BACK)) return `La fecha puede ser hasta ${MAX_DAYS_BACK} días anterior a hoy.`;
  if (issueDate < taxpayerStart) return `La fecha es anterior al inicio de actividad (${formatDateAR(taxpayerStart)}).`;
  return null;
}

type ValidDraft = {
  issueDate: string;
  recipient: { id: string | null; name: string; docType: string; docNumber: string | null; taxCondition: string };
  saveRecipient: boolean;
  items: { description: string; quantityMilli: number; unitPriceCents: bigint; subtotalCents: bigint }[];
  totalCents: bigint;
};

async function validateDraft(
  taxpayer: { id: string; studyId: string; startDate: string },
  input: DraftInput,
): Promise<{ ok: true; data: ValidDraft } | { ok: false; fieldErrors: Record<string, string> }> {
  const e: Record<string, string> = {};

  const dp = dateProblem(input.issueDate, taxpayer.startDate);
  if (dp) e.issueDate = dp;

  // Receptor
  let recipient: ValidDraft["recipient"] | null = null;
  if (input.recipientMode === "existente") {
    const saved = input.recipientId
      ? await prisma.invoiceRecipient.findFirst({
          where: { id: input.recipientId, taxpayerId: taxpayer.id, studyId: taxpayer.studyId },
        })
      : null;
    if (!saved) e.recipientId = "Elegí un receptor de la lista.";
    else {
      recipient = {
        id: saved.id,
        name: saved.name,
        docType: saved.docType,
        docNumber: saved.docNumber,
        taxCondition: saved.taxCondition,
      };
    }
  } else {
    const name = input.recipientName.trim();
    const docType = input.docType;
    const taxCondition = input.taxCondition;
    let docNumber: string | null = input.docNumber.replace(/\D/g, "") || null;

    if (name.length < 2 || name.length > 120) e.recipientName = "Ingresá el nombre o razón social (2 a 120 caracteres).";
    if (!TAX_CONDITIONS.includes(taxCondition)) e.taxCondition = "Elegí la condición frente al IVA.";
    if (!DOC_TYPES.includes(docType)) e.docType = "Elegí el tipo de documento.";
    else if (docType === "CUIT") {
      docNumber = normalizeCuit(input.docNumber);
      if (!isValidCuit(docNumber)) e.docNumber = "El CUIT no es válido.";
    } else if (docType === "DNI") {
      if (!docNumber || !/^\d{7,8}$/.test(docNumber)) e.docNumber = "El DNI tiene que tener 7 u 8 números.";
    } else {
      docNumber = null;
      if (taxCondition !== "CONSUMIDOR_FINAL") e.docType = "Sin identificar solo se permite para consumidor final.";
    }
    if (taxCondition !== "CONSUMIDOR_FINAL" && TAX_CONDITIONS.includes(taxCondition) && docType !== "CUIT") {
      e.docType = "Para esa condición frente al IVA el receptor tiene que tener CUIT.";
    }
    recipient = { id: null, name, docType, docNumber, taxCondition };
  }

  // Conceptos (se ignoran las filas totalmente vacías)
  // El índice es el de la fila en el formulario, para que el error aparezca al lado del campo correcto.
  const rows = input.items
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.description.trim() || row.quantity.trim() || row.unitPrice.trim());
  const items: ValidDraft["items"] = [];
  if (rows.length === 0) e.items = "Agregá al menos un concepto.";
  if (rows.length > MAX_ITEMS) e.items = `Máximo ${MAX_ITEMS} conceptos por factura.`;
  rows.slice(0, MAX_ITEMS).forEach(({ row, index: i }) => {
    const description = row.description.trim();
    const quantityMilli = parseQuantityMilli(row.quantity);
    const unitPriceCents = parseAmountToCents(row.unitPrice);
    if (description.length < 2 || description.length > 200) e[`item-${i}-description`] = "Describí el concepto (2 a 200 caracteres).";
    if (quantityMilli === null || quantityMilli <= 0) e[`item-${i}-quantity`] = "Cantidad inválida.";
    if (unitPriceCents === null || unitPriceCents <= 0n) e[`item-${i}-price`] = "Precio inválido.";
    if (quantityMilli && unitPriceCents && quantityMilli > 0 && unitPriceCents > 0n) {
      items.push({ description, quantityMilli, unitPriceCents, subtotalCents: lineSubtotalCents(quantityMilli, unitPriceCents) });
    }
  });
  const totalCents = items.reduce((acc, it) => acc + it.subtotalCents, 0n);
  if (!e.items && Object.keys(e).every((k) => !k.startsWith("item-")) && totalCents <= 0n) e.items = "El total tiene que ser mayor a cero.";
  if (totalCents > MAX_TOTAL_CENTS) e.items = "El total es demasiado alto para un comprobante.";

  if (Object.keys(e).length > 0 || !recipient) return { ok: false, fieldErrors: e };
  return { ok: true, data: { issueDate: input.issueDate, recipient, saveRecipient: input.saveRecipient, items, totalCents } };
}

function summary(items: { description: string }[]): string {
  const first = items[0]?.description ?? "";
  const text = items.length > 1 ? `${first} y ${items.length - 1} más` : first;
  return text.slice(0, 200);
}

/** Crea o actualiza un borrador. El total lo calcula el servidor: nunca se acepta un total del navegador. */
export async function saveDraft(
  user: CurrentUser,
  taxpayerId: string,
  input: DraftInput,
  invoiceId?: string,
): Promise<BillingResult> {
  const taxpayer = await getAuthorizedTaxpayer(user, taxpayerId);
  if (!taxpayer) return { ok: false, message: "No tenés acceso a este contribuyente." };

  if (invoiceId) {
    const existing = await getAuthorizedInvoice(user, invoiceId);
    if (!existing || existing.taxpayerId !== taxpayer.id || existing.source !== INVOICE_SOURCE.FACTURADOR) {
      return { ok: false, message: "No encontramos el borrador." };
    }
    if (existing.status !== INVOICE_STATUS.BORRADOR) return { ok: false, message: "Solo se pueden editar borradores." };
  }

  const v = await validateDraft(taxpayer, input);
  if (!v.ok) return { ok: false, message: "Revisá los campos marcados.", fieldErrors: v.fieldErrors };
  const d = v.data;

  const id = await prisma.$transaction(async (tx) => {
    let recipientId = d.recipient.id;
    if (!recipientId && d.saveRecipient) {
      const saved = await tx.invoiceRecipient.create({
        data: {
          studyId: taxpayer.studyId,
          taxpayerId: taxpayer.id,
          name: d.recipient.name,
          docType: d.recipient.docType,
          docNumber: d.recipient.docNumber,
          taxCondition: d.recipient.taxCondition,
        },
      });
      recipientId = saved.id;
    }

    const fields = {
      issueDate: d.issueDate,
      recipientId,
      recipientName: d.recipient.name,
      recipientDocType: d.recipient.docType,
      recipientDocNumber: d.recipient.docNumber,
      recipientTaxCondition: d.recipient.taxCondition,
      description: summary(d.items),
      amountCents: d.totalCents,
    };
    const items = d.items.map((it, position) => ({ ...it, position }));

    if (invoiceId) {
      // Condicionado al estado: si se emitió mientras tanto, no se pisa.
      const { count } = await tx.invoice.updateMany({
        where: { id: invoiceId, status: INVOICE_STATUS.BORRADOR },
        data: fields,
      });
      if (count !== 1) throw new Error("El borrador ya no se puede editar.");
      await tx.invoiceItem.deleteMany({ where: { invoiceId } });
      await tx.invoiceItem.createMany({ data: items.map((it) => ({ ...it, invoiceId })) });
      return invoiceId;
    }

    const created = await tx.invoice.create({
      data: {
        ...fields,
        studyId: taxpayer.studyId,
        taxpayerId: taxpayer.id,
        status: INVOICE_STATUS.BORRADOR,
        source: INVOICE_SOURCE.FACTURADOR,
        environment: APP_MODE,
        invoiceType: MONOTRIBUTO_INVOICE_TYPE,
        pointOfSale: DEMO_POINT_OF_SALE,
        createdById: user.id,
        items: { create: items },
      },
    });
    return created.id;
  });

  await prisma.auditEvent.create({
    data: {
      studyId: user.studyId,
      actorId: user.id,
      action: invoiceId ? "INVOICE_DRAFT_UPDATE" : "INVOICE_DRAFT_CREATE",
      entity: "Invoice",
      entityId: id,
      detail: `${taxpayer.name}: ${formatARS(d.totalCents)}`,
    },
  });
  return { ok: true, message: "Borrador guardado.", invoiceId: id };
}

export async function deleteDraft(user: CurrentUser, invoiceId: string): Promise<BillingResult> {
  const invoice = await getAuthorizedInvoice(user, invoiceId);
  if (!invoice || invoice.source !== INVOICE_SOURCE.FACTURADOR) return { ok: false, message: "No encontramos el borrador." };
  // Solo se borran borradores: un comprobante emitido nunca se elimina.
  const { count } = await prisma.invoice.deleteMany({ where: { id: invoice.id, status: INVOICE_STATUS.BORRADOR } });
  if (count !== 1) return { ok: false, message: "Solo se pueden eliminar borradores." };
  await prisma.auditEvent.create({
    data: { studyId: user.studyId, actorId: user.id, action: "INVOICE_DRAFT_DELETE", entity: "Invoice", entityId: invoice.id },
  });
  return { ok: true, message: "Borrador eliminado." };
}

/** Crea un borrador nuevo con los mismos datos (útil después de un rechazo). */
export async function duplicateAsDraft(user: CurrentUser, invoiceId: string): Promise<BillingResult> {
  const source = await getAuthorizedInvoice(user, invoiceId);
  if (!source || source.source !== INVOICE_SOURCE.FACTURADOR) return { ok: false, message: "No encontramos la factura." };
  const today = todayAR();
  const created = await prisma.invoice.create({
    data: {
      studyId: source.studyId,
      taxpayerId: source.taxpayerId,
      issueDate: today < source.taxpayer.startDate ? source.taxpayer.startDate : today,
      recipientId: source.recipientId,
      recipientName: source.recipientName,
      recipientDocType: source.recipientDocType,
      recipientDocNumber: source.recipientDocNumber,
      recipientTaxCondition: source.recipientTaxCondition,
      description: source.description,
      amountCents: source.amountCents,
      status: INVOICE_STATUS.BORRADOR,
      source: INVOICE_SOURCE.FACTURADOR,
      environment: source.environment,
      invoiceType: source.invoiceType,
      pointOfSale: source.pointOfSale,
      createdById: user.id,
      items: {
        create: source.items.map((it) => ({
          position: it.position,
          description: it.description,
          quantityMilli: it.quantityMilli,
          unitPriceCents: it.unitPriceCents,
          subtotalCents: it.subtotalCents,
        })),
      },
    },
  });
  await prisma.auditEvent.create({
    data: {
      studyId: user.studyId,
      actorId: user.id,
      action: "INVOICE_DRAFT_DUPLICATE",
      entity: "Invoice",
      entityId: created.id,
      detail: `Copia de ${source.id}`,
    },
  });
  return { ok: true, message: "Se creó un borrador nuevo.", invoiceId: created.id };
}

function requestHash(invoiceId: string, simulateRejection: boolean): string {
  return createHash("sha256").update(JSON.stringify({ invoiceId, simulateRejection })).digest("hex");
}

const STALE_MS = 2 * 60 * 1000;

/**
 * Si un intento quedó EN_PROCESO (por ejemplo, se cortó el servidor), se reconcilia con el estado del comprobante
 * antes de permitir otro. Con el proveedor simulado no hubo envío externo, así que se puede volver a borrador.
 */
async function reconcileStale(invoiceId: string) {
  const stale = await prisma.invoiceAttempt.findMany({
    where: { invoiceId, status: "EN_PROCESO", updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
    include: { invoice: true },
  });
  for (const attempt of stale) {
    const finished = [INVOICE_STATUS.SIMULADO, INVOICE_STATUS.RECHAZADO].includes(
      attempt.invoice.status as "SIMULADO" | "RECHAZADO",
    );
    await prisma.$transaction([
      prisma.invoiceAttempt.update({
        where: { id: attempt.id },
        data: finished
          ? { status: "COMPLETADO", resultStatus: attempt.invoice.status }
          : { status: "FALLIDO", error: "Interrumpido antes de terminar; se volvió a borrador." },
      }),
      ...(finished
        ? []
        : [
            prisma.invoice.updateMany({
              where: { id: invoiceId, status: INVOICE_STATUS.EN_PROCESO },
              data: { status: INVOICE_STATUS.BORRADOR },
            }),
          ]),
    ]);
  }
}

function resultMessage(status: string | null, invoice: { invoiceType: string | null; pointOfSale: number | null; number: number | null; rejectionReason?: string | null }) {
  if (status === INVOICE_STATUS.SIMULADO) {
    return `Factura emitida en simulación: ${formatInvoiceNumber(invoice.invoiceType, invoice.pointOfSale, invoice.number)}.`;
  }
  if (status === INVOICE_STATUS.RECHAZADO) return `La emisión fue rechazada: ${invoice.rejectionReason ?? "sin detalle"}`;
  return `Estado: ${STATUS_LABEL[status ?? ""] ?? status}.`;
}

/**
 * Emite un borrador con el proveedor del modo actual (en DEMO, el simulador).
 * Idempotente: la misma clave con el mismo pedido devuelve el mismo resultado; con otro pedido, conflicto.
 */
export async function emitInvoice(
  user: CurrentUser,
  invoiceId: string,
  idempotencyKey: string,
  simulateRejection: boolean,
): Promise<BillingResult> {
  if (!/^[\w-]{8,100}$/.test(idempotencyKey)) return { ok: false, message: "Pedido inválido. Recargá la página." };
  const invoice = await getAuthorizedInvoice(user, invoiceId);
  if (!invoice || invoice.source !== INVOICE_SOURCE.FACTURADOR) return { ok: false, message: "No encontramos la factura." };
  if (simulateRejection && APP_MODE !== "DEMO") return { ok: false, message: "El rechazo simulado solo existe en modo DEMO." };

  await reconcileStale(invoice.id);

  const hash = requestHash(invoice.id, simulateRejection);
  const uniqueKey = {
    studyId_taxpayerId_environment_idempotencyKey: {
      studyId: invoice.studyId,
      taxpayerId: invoice.taxpayerId,
      environment: invoice.environment,
      idempotencyKey,
    },
  };

  const previous = async (): Promise<BillingResult | null> => {
    const attempt = await prisma.invoiceAttempt.findUnique({ where: uniqueKey, include: { invoice: true } });
    if (!attempt) return null;
    if (attempt.requestHash !== hash || attempt.invoiceId !== invoice.id) {
      return { ok: false, message: "Esta clave de emisión ya se usó para otro pedido. Recargá la página." };
    }
    if (attempt.status === "COMPLETADO") {
      return { ok: true, message: resultMessage(attempt.resultStatus, attempt.invoice), invoiceId: invoice.id };
    }
    if (attempt.status === "EN_PROCESO") {
      return { ok: false, message: "La emisión ya está en proceso. Actualizá la página en unos segundos." };
    }
    return { ok: false, message: attempt.error ?? "La emisión anterior falló. Recargá la página para reintentar." };
  };

  const repeated = await previous();
  if (repeated) return repeated;

  if (invoice.status !== INVOICE_STATUS.BORRADOR) {
    return { ok: false, message: `La factura no está en borrador. ${resultMessage(invoice.status, invoice)}` };
  }
  const dp = dateProblem(invoice.issueDate, invoice.taxpayer.startDate);
  if (dp) return { ok: false, message: `No se puede emitir: ${dp} Editá el borrador.` };
  if (invoice.items.length === 0 || invoice.amountCents <= 0n) {
    return { ok: false, message: "No se puede emitir: el borrador no tiene conceptos válidos." };
  }

  // 1. Registrar el intento ANTES de llamar al proveedor (si el proceso se corta, queda para reconciliar).
  let attemptId: string;
  try {
    attemptId = await prisma.$transaction(async (tx) => {
      const attempt = await tx.invoiceAttempt.create({
        data: {
          studyId: invoice.studyId,
          taxpayerId: invoice.taxpayerId,
          environment: invoice.environment,
          idempotencyKey,
          requestHash: hash,
          invoiceId: invoice.id,
          status: "EN_PROCESO",
        },
      });
      const { count } = await tx.invoice.updateMany({
        where: { id: invoice.id, status: INVOICE_STATUS.BORRADOR },
        data: { status: INVOICE_STATUS.EN_PROCESO },
      });
      if (count !== 1) throw new Error("NO_ES_BORRADOR");
      return attempt.id;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Otro pedido con la misma clave llegó primero (doble clic).
      return (await previous()) ?? { ok: false, message: "La emisión ya está en proceso." };
    }
    if (err instanceof Error && err.message === "NO_ES_BORRADOR") {
      return { ok: false, message: "La factura ya se está emitiendo o ya fue emitida. Actualizá la página." };
    }
    throw err;
  }

  // 2. Llamar al proveedor fuera de cualquier transacción.
  const provider = getInvoiceProvider(invoice.environment);
  let result: IssueResult;
  try {
    result = await provider.issue({
      invoiceId: invoice.id,
      taxpayerId: invoice.taxpayerId,
      environment: invoice.environment,
      pointOfSale: invoice.pointOfSale ?? DEMO_POINT_OF_SALE,
      invoiceType: invoice.invoiceType ?? MONOTRIBUTO_INVOICE_TYPE,
      totalCents: invoice.amountCents,
      simulateRejection,
    });
  } catch (err) {
    // El simulador no envía nada afuera: si falla, es seguro volver a borrador.
    const message = err instanceof Error ? err.message : "Error desconocido";
    await prisma.$transaction([
      prisma.invoiceAttempt.update({ where: { id: attemptId }, data: { status: "FALLIDO", error: message.slice(0, 300) } }),
      prisma.invoice.update({ where: { id: invoice.id }, data: { status: INVOICE_STATUS.BORRADOR } }),
    ]);
    return { ok: false, message: `No se pudo emitir: ${message}` };
  }

  // 3. Guardar el resultado.
  const updated = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.update({
      where: { id: invoice.id },
      data:
        result.status === "SIMULADO"
          ? { status: INVOICE_STATUS.SIMULADO, number: result.number, issuedAt: result.issuedAt, rejectionReason: null }
          : { status: INVOICE_STATUS.RECHAZADO, rejectionReason: result.reason },
    });
    await tx.invoiceAttempt.update({ where: { id: attemptId }, data: { status: "COMPLETADO", resultStatus: inv.status } });
    await tx.auditEvent.create({
      data: {
        studyId: invoice.studyId,
        actorId: user.id,
        action: result.status === "SIMULADO" ? "INVOICE_SIMULATED" : "INVOICE_REJECTED",
        entity: "Invoice",
        entityId: invoice.id,
        detail: `${invoice.taxpayer.name}: ${formatARS(invoice.amountCents)} · ${provider.name}`,
      },
    });
    return inv;
  });

  return { ok: result.status === "SIMULADO", message: resultMessage(updated.status, updated), invoiceId: invoice.id };
}

export type InvoiceFilters = { status?: string; q?: string; from?: string; to?: string; page?: number };

export const PAGE_SIZE = 20;

/** Listado del facturador con filtros, orden estable y paginación. */
export async function listInvoices(taxpayerId: string, filters: InvoiceFilters) {
  const where: Prisma.InvoiceWhereInput = {
    taxpayerId,
    environment: APP_MODE,
    source: INVOICE_SOURCE.FACTURADOR,
  };
  if (filters.status && (Object.values(INVOICE_STATUS) as string[]).includes(filters.status)) where.status = filters.status;
  const q = filters.q?.trim().slice(0, 100);
  if (q) where.OR = [{ recipientName: { contains: q } }, { description: { contains: q } }];
  if (filters.from && isValidYmd(filters.from)) where.issueDate = { ...(where.issueDate as object), gte: filters.from };
  if (filters.to && isValidYmd(filters.to)) where.issueDate = { ...(where.issueDate as object), lte: filters.to };

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const [total, rows] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function listRecipients(taxpayerId: string) {
  return prisma.invoiceRecipient.findMany({ where: { taxpayerId }, orderBy: { name: "asc" }, take: 200 });
}
