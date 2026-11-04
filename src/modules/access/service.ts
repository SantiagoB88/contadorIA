import { notifyAccessReviewed } from "@/modules/bot/notify";
import { prisma } from "@/lib/db";
import { ACCESS_STATUS, REQUEST_STATUS, ROLES } from "@/lib/constants";
import { cuitProblem, formatCuit, isValidCuit, normalizeCuit } from "@/lib/cuit";
import { mail } from "@/providers/mail";
import { isValidYmd, todayAR } from "@/lib/dates";
import type { CurrentUser } from "@/lib/auth";

// Asociación usuario ↔ contribuyente.
// - CUIT que el estudio todavía no tiene: se crea el contribuyente (sin datos) y el acceso queda habilitado al
//   instante; el estudio recibe el aviso y lo ve en Accesos ("Clientes nuevos"), donde puede revocarlo.
// - CUIT que ya es de un contribuyente del estudio: lo aprueba el estudio (si no, cualquiera que conozca un CUIT
//   vería los datos de otra persona).
// Sin dependencias de Next, para poder probarlo con `npm run verify`.

export type ServiceResult =
  | { ok: true; message: string; approved?: boolean }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

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

  if (!isValidCuit(cuit)) fieldErrors.cuit = `El CUIT no es válido: ${cuitProblem(cuit)}`;
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

  const known = await prisma.taxpayer.findUnique({ where: { studyId_cuit: { studyId: user.studyId, cuit } } });
  if (!known) return selfOnboard(user, { cuit, name, activity, category, startDate: input.startDate });

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

/** Nota que identifica las altas habilitadas solas (las lista Accesos como "Clientes nuevos"). */
export const AUTO_APPROVAL_NOTE = "Alta automática: CUIT nuevo en el estudio";

/** CUIT nuevo en el estudio: crea el contribuyente sin datos, habilita el acceso y avisa al estudio. */
async function selfOnboard(
  user: CurrentUser,
  input: { cuit: string; name: string; activity: string; category: string; startDate: string },
): Promise<ServiceResult> {
  const taxpayer = await prisma.$transaction(async (tx) => {
    const created = await tx.taxpayer.create({
      data: {
        studyId: user.studyId,
        cuit: input.cuit,
        name: input.name,
        activity: input.activity,
        categoryCode: input.category || null,
        startDate: input.startDate,
      },
    });
    if (created.categoryCode) {
      await tx.categoryHistory.create({
        data: { taxpayerId: created.id, code: created.categoryCode, validFrom: created.startDate, reason: "Categoría declarada en el alta", createdById: user.id },
      });
    }
    await tx.taxpayerAccess.create({ data: { userId: user.id, taxpayerId: created.id, status: ACCESS_STATUS.APROBADO } });
    const request = await tx.accessRequest.create({
      data: {
        studyId: user.studyId,
        userId: user.id,
        cuit: input.cuit,
        declaredName: input.name,
        declaredActivity: input.activity,
        declaredCategory: input.category || null,
        declaredStartDate: input.startDate,
        status: REQUEST_STATUS.APROBADO,
        reviewedAt: new Date(),
        reviewNote: AUTO_APPROVAL_NOTE,
        taxpayerId: created.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        studyId: user.studyId,
        actorId: user.id,
        action: "ACCESS_AUTO_APPROVE",
        entity: "AccessRequest",
        entityId: request.id,
        detail: `${created.name} (CUIT ${input.cuit}) · contribuyente nuevo`,
      },
    });
    return created;
  });
  // Aviso al estudio (correo a los administradores). Si falla, el alta igual queda hecha.
  const admins = await prisma.user.findMany({ where: { studyId: user.studyId, role: ROLES.ADMIN, active: true }, select: { email: true } });
  for (const admin of admins) {
    await mail
      .send({
        to: admin.email,
        subject: `Cliente nuevo: ${taxpayer.name} (CUIT ${formatCuit(input.cuit)})`,
        body: `Se dio de alta un cliente nuevo y ya tiene acceso a su panel:\n\n• Persona: ${user.name} (${user.email})\n• Contribuyente: ${taxpayer.name}, CUIT ${formatCuit(input.cuit)}\n• Actividad: ${taxpayer.activity}\n\nEl contribuyente se creó sin datos: cargale la categoría, la facturación y los vencimientos. Si el alta no corresponde, revocá el acceso en Accesos.`,
      })
      .catch((err) => console.error("[accesos] No se pudo avisar del cliente nuevo:", err instanceof Error ? err.message : err));
  }
  return { ok: true, approved: true, message: `Listo: ya podés ver a ${taxpayer.name} en tu panel. El estudio recibió el aviso de tu alta.` };
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
      if (taxpayer.categoryCode) {
        await tx.categoryHistory.create({
          data: {
            taxpayerId: taxpayer.id,
            code: taxpayer.categoryCode,
            validFrom: taxpayer.startDate,
            reason: "Categoría inicial al aprobar el alta",
            createdById: admin.id,
          },
        });
      }
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

  // Aviso por WhatsApp (si tiene el número vinculado). Si falla el envío, la aprobación igual queda hecha.
  await notifyAccessReviewed(request.userId, { approved: true, taxpayerName: result.taxpayer.name, cuit: request.cuit }).catch((err) =>
    console.error("[accesos] No se pudo avisar por WhatsApp:", err instanceof Error ? err.message : err),
  );
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
  const rejected = await prisma.accessRequest.findUniqueOrThrow({ where: { id: requestId } });
  await notifyAccessReviewed(rejected.userId, { approved: false, taxpayerName: rejected.declaredName, cuit: rejected.cuit, note: reason.slice(0, 300) }).catch(
    (err) => console.error("[accesos] No se pudo avisar por WhatsApp:", err instanceof Error ? err.message : err),
  );
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
