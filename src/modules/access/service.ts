import { prisma } from "@/lib/db";
import { ACCESS_STATUS, REQUEST_STATUS, ROLES } from "@/lib/constants";
import { isValidCuit, normalizeCuit } from "@/lib/cuit";
import { isValidYmd, todayAR } from "@/lib/dates";
import type { CurrentUser } from "@/lib/auth";

// Asociación usuario ↔ contribuyente. Declarar un CUIT nunca da acceso: lo aprueba el estudio.
// Sin dependencias de Next, para poder probarlo con `npm run verify`.

export type ServiceResult = { ok: true; message: string } | { ok: false; message: string; fieldErrors?: Record<string, string> };

const MAX_PENDING_PER_USER = 5;

export type AssociationInput = {
  cuit: string;
  name: string;
  activity: string;
  category: string;
  startDate: string;
};

export async function requestAssociation(user: CurrentUser, input: AssociationInput): Promise<ServiceResult> {
  const cuit = normalizeCuit(input.cuit);
  const name = input.name.trim();
  const activity = input.activity.trim();
  const category = input.category.trim().toUpperCase();
  const fieldErrors: Record<string, string> = {};

  if (!isValidCuit(cuit)) fieldErrors.cuit = "El CUIT no es válido. Revisá los 11 números.";
  if (name.length < 2 || name.length > 120) fieldErrors.name = "Ingresá el nombre o razón social (2 a 120 caracteres).";
  if (activity.length < 2 || activity.length > 120) fieldErrors.activity = "Ingresá la actividad (2 a 120 caracteres).";
  if (category && !/^[A-K]$/.test(category)) fieldErrors.category = "Elegí una categoría de la A a la K.";
  if (!isValidYmd(input.startDate) || input.startDate > todayAR()) {
    fieldErrors.startDate = "Ingresá una fecha válida y no futura.";
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, message: "Revisá los campos marcados.", fieldErrors };

  const [pendingSame, pendingCount, approvedSame] = await Promise.all([
    prisma.accessRequest.findFirst({ where: { userId: user.id, cuit, status: REQUEST_STATUS.PENDIENTE } }),
    prisma.accessRequest.count({ where: { userId: user.id, status: REQUEST_STATUS.PENDIENTE } }),
    prisma.taxpayerAccess.findFirst({
      where: { userId: user.id, status: ACCESS_STATUS.APROBADO, taxpayer: { cuit, studyId: user.studyId } },
    }),
  ]);
  if (approvedSame) return { ok: false, message: "Ya tenés acceso a ese CUIT." };
  if (pendingSame) return { ok: false, message: "Ya tenés una solicitud pendiente para ese CUIT." };
  if (pendingCount >= MAX_PENDING_PER_USER) {
    return { ok: false, message: "Tenés demasiadas solicitudes pendientes. Esperá a que el estudio las revise." };
  }

  // No se consulta ni se informa si el CUIT ya existe: la respuesta es la misma en ambos casos.
  const request = await prisma.accessRequest.create({
    data: {
      studyId: user.studyId,
      userId: user.id,
      cuit,
      declaredName: name,
      declaredActivity: activity,
      declaredCategory: category || null,
      declaredStartDate: input.startDate,
      status: REQUEST_STATUS.PENDIENTE,
    },
  });
  await prisma.auditEvent.create({
    data: {
      studyId: user.studyId,
      actorId: user.id,
      action: "ACCESS_REQUEST_CREATE",
      entity: "AccessRequest",
      entityId: request.id,
      detail: `CUIT ${cuit}`,
    },
  });
  return { ok: true, message: "Solicitud enviada. El estudio la va a revisar y te avisamos por acá cuando esté aprobada." };
}

function assertAdmin(user: CurrentUser) {
  if (user.role !== ROLES.ADMIN) throw new Error("Solo un administrador puede hacer esto.");
}

/**
 * Aprueba una solicitud: usa el contribuyente existente con ese CUIT o lo crea con los datos declarados,
 * y habilita el acceso. Todo en una transacción.
 */
export async function approveRequest(
  admin: CurrentUser,
  requestId: string,
  categoryInput: string,
  note: string,
): Promise<ServiceResult> {
  assertAdmin(admin);
  const category = categoryInput.trim().toUpperCase();
  if (category && !/^[A-K]$/.test(category)) {
    return { ok: false, message: "Revisá los campos marcados.", fieldErrors: { category: "Elegí una categoría válida." } };
  }

  const request = await prisma.accessRequest.findFirst({
    where: { id: requestId, studyId: admin.studyId, status: REQUEST_STATUS.PENDIENTE },
  });
  if (!request) return { ok: false, message: "La solicitud no existe o ya fue revisada." };

  const result = await prisma.$transaction(async (tx) => {
    let taxpayer = await tx.taxpayer.findUnique({
      where: { studyId_cuit: { studyId: admin.studyId, cuit: request.cuit } },
    });
    const created = !taxpayer;
    if (!taxpayer) {
      taxpayer = await tx.taxpayer.create({
        data: {
          studyId: admin.studyId,
          cuit: request.cuit,
          name: request.declaredName,
          activity: request.declaredActivity,
          categoryCode: category || null,
          startDate: request.declaredStartDate,
        },
      });
    }
    await tx.taxpayerAccess.upsert({
      where: { userId_taxpayerId: { userId: request.userId, taxpayerId: taxpayer.id } },
      update: { status: ACCESS_STATUS.APROBADO },
      create: { userId: request.userId, taxpayerId: taxpayer.id, status: ACCESS_STATUS.APROBADO },
    });
    // El update condicionado al estado evita aprobar dos veces la misma solicitud.
    const { count } = await tx.accessRequest.updateMany({
      where: { id: request.id, status: REQUEST_STATUS.PENDIENTE },
      data: {
        status: REQUEST_STATUS.APROBADO,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        reviewNote: note.trim() || null,
        taxpayerId: taxpayer.id,
      },
    });
    if (count !== 1) throw new Error("La solicitud ya fue revisada.");
    await tx.auditEvent.create({
      data: {
        studyId: admin.studyId,
        actorId: admin.id,
        action: "ACCESS_REQUEST_APPROVE",
        entity: "AccessRequest",
        entityId: request.id,
        detail: `${taxpayer.name} (CUIT ${request.cuit})${created ? " · contribuyente nuevo" : ""}`,
      },
    });
    return { taxpayer, created };
  });

  return {
    ok: true,
    message: result.created
      ? `Aprobada. Se creó el contribuyente ${result.taxpayer.name}.`
      : `Aprobada. El usuario ahora ve a ${result.taxpayer.name}.`,
  };
}

export async function rejectRequest(admin: CurrentUser, requestId: string, note: string): Promise<ServiceResult> {
  assertAdmin(admin);
  const reason = note.trim();
  if (reason.length < 3) {
    return { ok: false, message: "Revisá los campos marcados.", fieldErrors: { note: "Indicá el motivo (lo ve el cliente)." } };
  }
  const { count } = await prisma.accessRequest.updateMany({
    where: { id: requestId, studyId: admin.studyId, status: REQUEST_STATUS.PENDIENTE },
    data: { status: REQUEST_STATUS.RECHAZADO, reviewedById: admin.id, reviewedAt: new Date(), reviewNote: reason.slice(0, 300) },
  });
  if (count !== 1) return { ok: false, message: "La solicitud no existe o ya fue revisada." };
  await prisma.auditEvent.create({
    data: {
      studyId: admin.studyId,
      actorId: admin.id,
      action: "ACCESS_REQUEST_REJECT",
      entity: "AccessRequest",
      entityId: requestId,
      detail: `Motivo: ${reason.slice(0, 300)}`,
    },
  });
  return { ok: true, message: "Solicitud rechazada." };
}

/** Revoca un acceso. Rige desde la próxima petición: los permisos se consultan en cada pantalla. */
export async function revokeAccess(admin: CurrentUser, accessId: string, reasonInput: string): Promise<ServiceResult> {
  assertAdmin(admin);
  const reason = reasonInput.trim();
  if (reason.length < 3) {
    return { ok: false, message: "Revisá los campos marcados.", fieldErrors: { reason: "Indicá el motivo de la revocación." } };
  }
  const access = await prisma.taxpayerAccess.findFirst({
    where: { id: accessId, status: ACCESS_STATUS.APROBADO, taxpayer: { studyId: admin.studyId } },
    include: { taxpayer: true, user: true },
  });
  if (!access) return { ok: false, message: "El acceso no existe o ya estaba revocado." };

  await prisma.taxpayerAccess.update({ where: { id: access.id }, data: { status: ACCESS_STATUS.REVOCADO } });
  await prisma.auditEvent.create({
    data: {
      studyId: admin.studyId,
      actorId: admin.id,
      action: "ACCESS_REVOKE",
      entity: "TaxpayerAccess",
      entityId: access.id,
      detail: `${access.user.email} → ${access.taxpayer.name}. Motivo: ${reason.slice(0, 300)}`,
    },
  });
  return { ok: true, message: `Acceso revocado: ${access.user.name} ya no ve a ${access.taxpayer.name}.` };
}

/** Suspende o reactiva un usuario del estudio. Al suspender se cierran sus sesiones. */
export async function setUserActive(admin: CurrentUser, userId: string, active: boolean): Promise<ServiceResult> {
  assertAdmin(admin);
  if (userId === admin.id) return { ok: false, message: "No podés suspender tu propio usuario." };
  const user = await prisma.user.findFirst({ where: { id: userId, studyId: admin.studyId } });
  if (!user) return { ok: false, message: "El usuario no existe en tu estudio." };
  if (user.active === active) return { ok: false, message: active ? "El usuario ya estaba activo." : "El usuario ya estaba suspendido." };

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { active } }),
    ...(active ? [] : [prisma.session.deleteMany({ where: { userId: user.id } })]),
    prisma.auditEvent.create({
      data: {
        studyId: admin.studyId,
        actorId: admin.id,
        action: active ? "USER_REACTIVATE" : "USER_SUSPEND",
        entity: "User",
        entityId: user.id,
        detail: user.email,
      },
    }),
  ]);
  return { ok: true, message: active ? `${user.name} fue reactivado.` : `${user.name} fue suspendido y se cerraron sus sesiones.` };
}
