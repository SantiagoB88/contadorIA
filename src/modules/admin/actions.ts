"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { APP_MODE, INVOICE_SOURCE, INVOICE_STATUS } from "@/lib/constants";
import { formatARS, parseAmountToCents } from "@/lib/money";
import { formatDateAR, isValidYmd, todayAR } from "@/lib/dates";

export type FormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const MAX_AMOUNT_CENTS = 100_000_000_000n; // $ 1.000 millones por comprobante

/** El contribuyente se busca siempre dentro del estudio del usuario logueado. */
async function findStudyTaxpayer(studyId: string, taxpayerId: string) {
  return prisma.taxpayer.findFirst({ where: { id: taxpayerId, studyId } });
}

function refresh(taxpayerId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  revalidatePath(`/admin/contribuyentes/${taxpayerId}`);
}

const invoiceSchema = z.object({
  taxpayerId: z.string().min(1),
  issueDate: z.string(),
  recipientName: z.string().trim().min(2, "Ingresá el receptor (mínimo 2 caracteres).").max(120, "Máximo 120 caracteres."),
  description: z.string().trim().min(2, "Ingresá el concepto (mínimo 2 caracteres).").max(200, "Máximo 200 caracteres."),
  amount: z.string().trim(),
});

export async function addInvoiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const raw = {
    taxpayerId: String(formData.get("taxpayerId") ?? ""),
    issueDate: String(formData.get("issueDate") ?? ""),
    recipientName: String(formData.get("recipientName") ?? ""),
    description: String(formData.get("description") ?? ""),
    amount: String(formData.get("amount") ?? ""),
  };
  const values = { issueDate: raw.issueDate, recipientName: raw.recipientName, description: raw.description, amount: raw.amount };

  const taxpayer = await findStudyTaxpayer(admin.studyId, raw.taxpayerId);
  if (!taxpayer) return { ok: false, message: "No encontramos el contribuyente en tu estudio." };

  const parsed = invoiceSchema.safeParse(raw);
  const fieldErrors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] ??= issue.message;
    }
  }

  const today = todayAR();
  if (!isValidYmd(raw.issueDate)) fieldErrors.issueDate = "Ingresá una fecha válida.";
  else if (raw.issueDate > today) fieldErrors.issueDate = "La fecha no puede ser futura.";
  else if (raw.issueDate < taxpayer.startDate)
    fieldErrors.issueDate = `La fecha es anterior al inicio de actividad (${formatDateAR(taxpayer.startDate)}).`;

  const amountCents = parseAmountToCents(raw.amount);
  if (amountCents === null) fieldErrors.amount = "Ingresá un importe válido, por ejemplo 150000 o 150.000,50.";
  else if (amountCents <= 0n) fieldErrors.amount = "El importe tiene que ser mayor a cero.";
  else if (amountCents > MAX_AMOUNT_CENTS) fieldErrors.amount = "El importe es demasiado alto para un comprobante.";

  if (Object.keys(fieldErrors).length > 0 || !parsed.success || amountCents === null) {
    return { ok: false, message: "Revisá los campos marcados.", fieldErrors, values };
  }

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        studyId: admin.studyId,
        taxpayerId: taxpayer.id,
        issueDate: raw.issueDate,
        recipientName: parsed.data.recipientName,
        description: parsed.data.description,
        amountCents,
        status: INVOICE_STATUS.VERIFICADO,
        source: INVOICE_SOURCE.CARGA_MANUAL,
        environment: APP_MODE,
        createdById: admin.id,
      },
    });
    // Actualiza la fecha de última carga. Si no había cobertura, se crea como parcial desde esta fecha.
    await tx.dataCoverage.upsert({
      where: { taxpayerId: taxpayer.id },
      update: { source: "Cargado por el estudio" },
      create: { taxpayerId: taxpayer.id, fromDate: raw.issueDate, complete: false, source: "Cargado por el estudio" },
    });
    await tx.auditEvent.create({
      data: {
        studyId: admin.studyId,
        actorId: admin.id,
        action: "INVOICE_MANUAL_CREATE",
        entity: "Invoice",
        entityId: created.id,
        detail: `${taxpayer.name}: ${formatARS(amountCents)} del ${formatDateAR(raw.issueDate)}`,
      },
    });
    return created;
  });

  refresh(taxpayer.id);
  return { ok: true, message: `Comprobante cargado: ${formatARS(invoice.amountCents)} del ${formatDateAR(invoice.issueDate)}.` };
}

export async function updateCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const taxpayerId = String(formData.get("taxpayerId") ?? "");
  const code = String(formData.get("categoryCode") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const values = { categoryCode: code, reason };

  const taxpayer = await findStudyTaxpayer(admin.studyId, taxpayerId);
  if (!taxpayer) return { ok: false, message: "No encontramos el contribuyente en tu estudio." };

  const fieldErrors: Record<string, string> = {};
  if (code !== "") {
    const exists = await prisma.taxCategoryLimit.findFirst({ where: { code } });
    if (!exists) fieldErrors.categoryCode = "Elegí una categoría de la escala.";
  }
  if (reason.length < 3) fieldErrors.reason = "Indicá el motivo del cambio (queda en la auditoría).";
  if (reason.length > 300) fieldErrors.reason = "Máximo 300 caracteres.";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, message: "Revisá los campos marcados.", fieldErrors, values };

  const newCode = code === "" ? null : code;
  if (newCode === taxpayer.categoryCode) return { ok: false, message: "La categoría elegida es la misma que la actual.", values };

  await prisma.taxpayer.update({ where: { id: taxpayer.id }, data: { categoryCode: newCode } });
  await audit({
    studyId: admin.studyId,
    actorId: admin.id,
    action: "CATEGORY_UPDATE",
    entity: "Taxpayer",
    entityId: taxpayer.id,
    detail: `${taxpayer.categoryCode ?? "sin categoría"} → ${newCode ?? "sin categoría"}. Motivo: ${reason}`,
  });

  refresh(taxpayer.id);
  return { ok: true, message: `Categoría actualizada a ${newCode ?? "sin categoría"}.` };
}

export async function updateCoverageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const taxpayerId = String(formData.get("taxpayerId") ?? "");
  const fromDate = String(formData.get("fromDate") ?? "");
  const complete = formData.get("complete") === "on";
  const values = { fromDate, complete: complete ? "on" : "" };

  const taxpayer = await findStudyTaxpayer(admin.studyId, taxpayerId);
  if (!taxpayer) return { ok: false, message: "No encontramos el contribuyente en tu estudio." };

  if (!isValidYmd(fromDate) || fromDate > todayAR()) {
    return { ok: false, message: "Revisá los campos marcados.", fieldErrors: { fromDate: "Ingresá una fecha válida y no futura." }, values };
  }

  await prisma.dataCoverage.upsert({
    where: { taxpayerId: taxpayer.id },
    update: { fromDate, complete, source: "Cargado por el estudio" },
    create: { taxpayerId: taxpayer.id, fromDate, complete, source: "Cargado por el estudio" },
  });
  await audit({
    studyId: admin.studyId,
    actorId: admin.id,
    action: "COVERAGE_UPDATE",
    entity: "Taxpayer",
    entityId: taxpayer.id,
    detail: `Datos desde ${formatDateAR(fromDate)} · ${complete ? "completos" : "parciales"}`,
  });

  refresh(taxpayer.id);
  return { ok: true, message: "Cobertura de datos actualizada." };
}
