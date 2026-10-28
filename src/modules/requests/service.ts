import { prisma } from "@/lib/db";
import {
  ACCESS_STATUS,
  CHANNEL,
  DOC_VISIBILITY,
  MESSAGE_VISIBILITY,
  OBLIGATION_STATUS,
  ROLES,
  SR_PRIORITY_LABEL,
  SR_STATUS,
  SR_STATUS_LABEL,
  SR_TOPIC_LABEL,
} from "@/lib/constants";
import { formatDateAR, monthLabelLong, parseYmd, todayAR } from "@/lib/dates";
import type { CurrentUser } from "@/lib/auth";
import type { ServiceResult } from "@/modules/access/service";
import { getAuthorizedTaxpayer } from "@/modules/taxpayers/access";
import { checkFiles, discardStored, storeFiles, type StoredFile, type UploadFile } from "@/modules/documents/service";
import { mail } from "@/providers/mail";
import type { Prisma } from "@prisma/client";

// Solicitudes al estudio: conversación con mensajes públicos y notas internas.
// Sin dependencias de Next: la web las usa hoy y un canal futuro (WhatsApp) podría usar los mismos servicios
// pasando otro `channel`. Las notas internas se filtran en la consulta: nunca llegan a una respuesta del cliente.

export type RequestResult = { ok: true; message: string; requestId: string } | { ok: false; message: string; fieldErrors?: Record<string, string> };

const STATUS_VALUES: string[] = Object.values(SR_STATUS);
const CLIENT_TOPICS = Object.keys(SR_TOPIC_LABEL).filter((t) => t !== "PAGO");
const MAX_ACTIVE_PER_USER = 20;

const isStaff = (user: CurrentUser) => user.role === ROLES.ADMIN;

function assertAdmin(user: CurrentUser) {
  if (!isStaff(user)) throw new Error("Solo el estudio puede hacer esto.");
}

function checkBody(body: string): string | null {
  if (body.length < 2) return "Escribí un mensaje.";
  if (body.length > 4000) return "El mensaje es demasiado largo (máximo 4.000 caracteres).";
  return null;
}

async function staffRecipients(studyId: string, assignedToId: string | null): Promise<string[]> {
  if (assignedToId) {
    const assignee = await prisma.user.findFirst({ where: { id: assignedToId, studyId, active: true } });
    if (assignee) return [assignee.email];
  }
  const admins = await prisma.user.findMany({ where: { studyId, role: ROLES.ADMIN, active: true }, select: { email: true } });
  return admins.map((a) => a.email);
}

/** Avisos por correo: nunca incluyen el texto de los mensajes, solo el enlace para verlos con sesión. */
async function notify(to: string[], subject: string, body: string) {
  for (const address of to) await mail.send({ to: address, subject, body });
}

async function createMessage(
  tx: Prisma.TransactionClient,
  input: {
    request: { id: string; studyId: string; taxpayerId: string };
    authorId: string;
    body: string;
    visibility: string;
    channel: string;
    files: StoredFile[];
    category: string;
    obligationId?: string | null;
  },
) {
  const message = await tx.requestMessage.create({
    data: {
      requestId: input.request.id,
      authorId: input.authorId,
      body: input.body,
      visibility: input.visibility,
      channel: input.channel,
    },
  });
  for (const f of input.files) {
    await tx.document.create({
      data: {
        studyId: input.request.studyId,
        taxpayerId: input.request.taxpayerId,
        storageKey: f.storageKey,
        fileName: f.fileName,
        mimeType: f.mimeType,
        sizeBytes: f.bytes.length,
        sha256: f.sha256,
        category: input.category,
        // Un adjunto hereda la visibilidad del mensaje: el de una nota interna es interno.
        visibility: input.visibility === MESSAGE_VISIBILITY.PUBLICA ? DOC_VISIBILITY.CLIENTE : DOC_VISIBILITY.INTERNO,
        uploadedById: input.authorId,
        messageId: message.id,
        obligationId: input.obligationId ?? null,
      },
    });
  }
  return message;
}

/** Guarda los archivos y corre la transacción; si la base falla, borra los archivos escritos. */
async function withStoredFiles<T>(files: StoredFile[], fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await discardStored(files);
    throw err;
  }
}

export type NewRequestInput = { taxpayerId: string; topic: string; subject: string; body: string; channel?: string };

/** El cliente (o el estudio en su nombre) crea una solicitud con su primer mensaje y adjuntos opcionales. */
export async function createRequest(user: CurrentUser, input: NewRequestInput, files: UploadFile[], origin: string): Promise<RequestResult> {
  const subject = input.subject.trim();
  const body = input.body.trim();
  const fieldErrors: Record<string, string> = {};
  const taxpayer = await getAuthorizedTaxpayer(user, input.taxpayerId);
  if (!taxpayer) fieldErrors.taxpayerId = "Elegí un contribuyente habilitado.";
  if (!CLIENT_TOPICS.includes(input.topic)) fieldErrors.topic = "Elegí un tema.";
  if (subject.length < 3 || subject.length > 120) fieldErrors.subject = "Escribí un asunto (3 a 120 caracteres).";
  const bodyError = checkBody(body);
  if (bodyError) fieldErrors.body = bodyError;
  const checked = checkFiles(files);
  if (!checked.ok) fieldErrors.files = checked.message;
  if (Object.keys(fieldErrors).length > 0 || !taxpayer || !checked.ok) return { ok: false, message: "Revisá los campos marcados.", fieldErrors };

  const active = await prisma.serviceRequest.count({
    where: { createdById: user.id, status: { not: SR_STATUS.RESUELTA } },
  });
  if (active >= MAX_ACTIVE_PER_USER) {
    return { ok: false, message: "Tenés muchas solicitudes abiertas. Esperá a que el estudio responda alguna." };
  }

  const channel = input.channel ?? CHANNEL.WEB;
  const stored = await storeFiles(checked.files);
  const request = await withStoredFiles(stored, () =>
    prisma.$transaction(async (tx) => {
      const request = await tx.serviceRequest.create({
        data: {
          studyId: user.studyId,
          taxpayerId: taxpayer.id,
          createdById: user.id,
          topic: input.topic,
          subject,
          status: SR_STATUS.ABIERTA,
          channel,
        },
      });
      await createMessage(tx, {
        request,
        authorId: user.id,
        body,
        visibility: MESSAGE_VISIBILITY.PUBLICA,
        channel,
        files: stored,
        category: "ADJUNTO",
      });
      await tx.auditEvent.create({
        data: {
          studyId: user.studyId,
          actorId: user.id,
          action: "REQUEST_CREATE",
          entity: "ServiceRequest",
          entityId: request.id,
          detail: `${taxpayer.name}: ${subject}${stored.length ? ` · ${stored.length} adjunto(s)` : ""}`,
        },
      });
      return request;
    }),
  );

  await notify(
    await staffRecipients(user.studyId, null),
    `Nueva solicitud: ${subject}`,
    `${user.name} creó una solicitud para ${taxpayer.name} (${SR_TOPIC_LABEL[input.topic]}).\n\nVer la solicitud:\n${origin}/admin/solicitudes/${request.id}`,
  );
  return { ok: true, message: "Solicitud enviada. Te avisamos por correo cuando el estudio responda.", requestId: request.id };
}

/** Solicitud a la que el usuario tiene acceso (sin mensajes), o null. */
async function findAuthorizedRequest(user: CurrentUser, requestId: string) {
  if (!requestId) return null;
  const request = await prisma.serviceRequest.findFirst({
    where: { id: requestId, studyId: user.studyId },
    include: { taxpayer: true, createdBy: true },
  });
  if (!request) return null;
  if (isStaff(user)) return request;
  return (await getAuthorizedTaxpayer(user, request.taxpayerId)) ? request : null;
}

export type RequestView = NonNullable<Awaited<ReturnType<typeof getRequestForUser>>>;

/**
 * Detalle con la conversación. Para un cliente la consulta solo trae mensajes PUBLICA y adjuntos CLIENTE:
 * las notas internas no salen de la base.
 */
export async function getRequestForUser(user: CurrentUser, requestId: string) {
  const request = await findAuthorizedRequest(user, requestId);
  if (!request) return null;
  const staff = isStaff(user);

  const [messages, assignee, obligation] = await Promise.all([
    prisma.requestMessage.findMany({
      where: { requestId: request.id, ...(staff ? {} : { visibility: MESSAGE_VISIBILITY.PUBLICA }) },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        body: true,
        visibility: true,
        channel: true,
        createdAt: true,
        author: { select: { name: true, role: true } },
        documents: {
          where: staff ? {} : { visibility: DOC_VISIBILITY.CLIENTE },
          select: { id: true, fileName: true, sizeBytes: true, mimeType: true },
        },
      },
    }),
    request.assignedToId ? prisma.user.findUnique({ where: { id: request.assignedToId }, select: { id: true, name: true } }) : null,
    request.obligationId
      ? prisma.obligation.findFirst({ where: { id: request.obligationId, taxpayerId: request.taxpayerId } })
      : null,
  ]);

  return {
    id: request.id,
    subject: request.subject,
    topic: request.topic,
    status: request.status,
    priority: request.priority,
    channel: request.channel,
    createdAt: request.createdAt,
    lastActivityAt: request.lastActivityAt,
    taxpayer: { id: request.taxpayer.id, name: request.taxpayer.name },
    createdBy: { name: request.createdBy.name },
    assignedTo: assignee,
    obligation: obligation
      ? { id: obligation.id, concept: obligation.concept, period: obligation.period, dueDate: obligation.dueDate, status: obligation.status }
      : null,
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      visibility: m.visibility,
      channel: m.channel,
      createdAt: m.createdAt,
      author: { name: m.author.name, fromStudy: m.author.role === ROLES.ADMIN },
      documents: m.documents,
    })),
  };
}

export type ReplyInput = { body: string; visibility: string; newStatus?: string; channel?: string };

/**
 * Agrega un mensaje.
 * - Cliente: siempre público. Si la solicitud esperaba su respuesta o estaba resuelta, vuelve a "En curso".
 * - Estudio: público o nota interna, con cambio de estado opcional. La primera respuesta pública toma la solicitud si nadie la tenía.
 */
export async function addMessage(user: CurrentUser, requestId: string, input: ReplyInput, files: UploadFile[], origin: string): Promise<ServiceResult> {
  const request = await findAuthorizedRequest(user, requestId);
  if (!request) return { ok: false, message: "La solicitud no existe o no tenés acceso." };
  const staff = isStaff(user);

  const body = input.body.trim();
  const fieldErrors: Record<string, string> = {};
  if (input.visibility !== MESSAGE_VISIBILITY.PUBLICA && input.visibility !== MESSAGE_VISIBILITY.INTERNA) {
    fieldErrors.visibility = "Elegí el tipo de mensaje.";
  }
  if (!staff && input.visibility !== MESSAGE_VISIBILITY.PUBLICA) {
    return { ok: false, message: "Solo el estudio puede escribir notas internas." };
  }
  const bodyError = checkBody(body);
  if (bodyError) fieldErrors.body = bodyError;
  if (staff && input.newStatus && !STATUS_VALUES.includes(input.newStatus)) fieldErrors.newStatus = "Elegí un estado.";
  const checked = checkFiles(files);
  if (!checked.ok) fieldErrors.files = checked.message;
  if (Object.keys(fieldErrors).length > 0 || !checked.ok) return { ok: false, message: "Revisá los campos marcados.", fieldErrors };

  const isPublic = input.visibility === MESSAGE_VISIBILITY.PUBLICA;
  let status = request.status;
  if (staff) {
    if (input.newStatus) status = input.newStatus;
    else if (isPublic && status === SR_STATUS.ABIERTA) status = SR_STATUS.EN_CURSO;
  } else if (status === SR_STATUS.ESPERANDO_CLIENTE || status === SR_STATUS.RESUELTA) {
    status = SR_STATUS.EN_CURSO;
  }
  const assignedToId = staff && isPublic && !request.assignedToId ? user.id : request.assignedToId;
  const channel = input.channel ?? CHANNEL.WEB;

  const stored = await storeFiles(checked.files);
  await withStoredFiles(stored, () =>
    prisma.$transaction(async (tx) => {
      await createMessage(tx, {
        request,
        authorId: user.id,
        body,
        visibility: input.visibility,
        channel,
        files: stored,
        category: "ADJUNTO",
      });
      await tx.serviceRequest.update({
        where: { id: request.id },
        data: { status, assignedToId, lastActivityAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          studyId: request.studyId,
          actorId: user.id,
          action: isPublic ? "REQUEST_MESSAGE" : "REQUEST_INTERNAL_NOTE",
          entity: "ServiceRequest",
          entityId: request.id,
          detail: `${request.taxpayer.name}: ${request.subject}${status !== request.status ? ` · ${SR_STATUS_LABEL[request.status]} → ${SR_STATUS_LABEL[status]}` : ""}${
            stored.length ? ` · ${stored.length} adjunto(s)` : ""
          }`,
        },
      });
    }),
  );

  // Una nota interna no avisa al cliente. Una respuesta del estudio avisa a quien creó la solicitud.
  if (staff && isPublic) {
    await notify(
      [request.createdBy.email],
      `Respuesta del estudio: ${request.subject}`,
      `Hola ${request.createdBy.name}:\n\nEl estudio respondió tu solicitud "${request.subject}".\n\nVer la respuesta:\n${origin}/solicitudes/${request.id}`,
    );
  } else if (!staff) {
    await notify(
      await staffRecipients(request.studyId, assignedToId),
      `Nuevo mensaje del cliente: ${request.subject}`,
      `${user.name} escribió en la solicitud "${request.subject}" (${request.taxpayer.name}).\n\nVer la solicitud:\n${origin}/admin/solicitudes/${request.id}`,
    );
  }
  return { ok: true, message: isPublic ? "Mensaje enviado." : "Nota interna guardada. El cliente no la ve." };
}

/** Estado, prioridad y asignación. Solo el estudio. */
export async function updateRequest(
  admin: CurrentUser,
  requestId: string,
  input: { status: string; priority: string; assignedToId: string },
  origin: string,
): Promise<ServiceResult> {
  assertAdmin(admin);
  const request = await findAuthorizedRequest(admin, requestId);
  if (!request) return { ok: false, message: "La solicitud no existe en tu estudio." };

  const fieldErrors: Record<string, string> = {};
  if (!STATUS_VALUES.includes(input.status)) fieldErrors.status = "Elegí un estado.";
  if (!(input.priority in SR_PRIORITY_LABEL)) fieldErrors.priority = "Elegí una prioridad.";
  let assignee: { id: string; name: string } | null = null;
  if (input.assignedToId) {
    // Solo personal activo del mismo estudio.
    assignee = await prisma.user.findFirst({
      where: { id: input.assignedToId, studyId: admin.studyId, role: ROLES.ADMIN, active: true },
      select: { id: true, name: true },
    });
    if (!assignee) fieldErrors.assignedToId = "Elegí una persona del estudio.";
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, message: "Revisá los campos marcados.", fieldErrors };

  const changes: string[] = [];
  if (input.status !== request.status) changes.push(`estado ${SR_STATUS_LABEL[request.status]} → ${SR_STATUS_LABEL[input.status]}`);
  if (input.priority !== request.priority) changes.push(`prioridad ${SR_PRIORITY_LABEL[input.priority]}`);
  if ((assignee?.id ?? null) !== request.assignedToId) changes.push(assignee ? `asignada a ${assignee.name}` : "sin asignar");
  if (changes.length === 0) return { ok: false, message: "No hay cambios para guardar." };

  await prisma.$transaction([
    prisma.serviceRequest.update({
      where: { id: request.id },
      data: { status: input.status, priority: input.priority, assignedToId: assignee?.id ?? null, lastActivityAt: new Date() },
    }),
    prisma.auditEvent.create({
      data: {
        studyId: admin.studyId,
        actorId: admin.id,
        action: "REQUEST_UPDATE",
        entity: "ServiceRequest",
        entityId: request.id,
        detail: `${request.taxpayer.name}: ${request.subject} · ${changes.join(", ")}`,
      },
    }),
  ]);

  if (input.status !== request.status && input.status === SR_STATUS.RESUELTA) {
    await notify(
      [request.createdBy.email],
      `Solicitud resuelta: ${request.subject}`,
      `Hola ${request.createdBy.name}:\n\nEl estudio marcó como resuelta tu solicitud "${request.subject}". Si necesitás algo más, respondé en la misma solicitud.\n\n${origin}/solicitudes/${request.id}`,
    );
  }
  return { ok: true, message: `Cambios guardados: ${changes.join(", ")}.` };
}

export type ClientRequestFilter = { taxpayerId?: string; view?: string };

const requestListSelect = {
  id: true,
  subject: true,
  topic: true,
  status: true,
  priority: true,
  channel: true,
  createdAt: true,
  lastActivityAt: true,
  taxpayer: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.ServiceRequestSelect;

/** Solicitudes de los contribuyentes habilitados del cliente (el estudio ve las de todo el estudio). */
export async function listRequestsForUser(user: CurrentUser, filter: ClientRequestFilter, take = 100) {
  const statusWhere =
    filter.view === "resueltas"
      ? { status: SR_STATUS.RESUELTA }
      : filter.view === "todas"
        ? {}
        : { status: { not: SR_STATUS.RESUELTA } };
  return prisma.serviceRequest.findMany({
    where: {
      studyId: user.studyId,
      ...(filter.taxpayerId ? { taxpayerId: filter.taxpayerId } : {}),
      ...(isStaff(user) ? {} : { taxpayer: { accesses: { some: { userId: user.id, status: ACCESS_STATUS.APROBADO } } } }),
      ...statusWhere,
    },
    orderBy: { lastActivityAt: "desc" },
    take,
    select: requestListSelect,
  });
}

export type InboxFilter = { status?: string; assigned?: string; taxpayerId?: string };

/** Bandeja del estudio con filtros y conteos para los accesos rápidos. */
export async function listInbox(admin: CurrentUser, filter: InboxFilter) {
  assertAdmin(admin);
  const base = { studyId: admin.studyId };
  const active = { status: { not: SR_STATUS.RESUELTA } };

  const statusWhere =
    filter.status === "todas"
      ? {}
      : filter.status && STATUS_VALUES.includes(filter.status)
        ? { status: filter.status }
        : active;
  const assignedWhere =
    filter.assigned === "mias" ? { assignedToId: admin.id } : filter.assigned === "sin" ? { assignedToId: null } : {};

  const [rows, counts] = await Promise.all([
    prisma.serviceRequest.findMany({
      where: { ...base, ...statusWhere, ...assignedWhere, ...(filter.taxpayerId ? { taxpayerId: filter.taxpayerId } : {}) },
      orderBy: [{ lastActivityAt: "desc" }],
      take: 200,
      select: requestListSelect,
    }),
    Promise.all([
      prisma.serviceRequest.count({ where: { ...base, ...active } }),
      prisma.serviceRequest.count({ where: { ...base, ...active, assignedToId: null } }),
      prisma.serviceRequest.count({ where: { ...base, ...active, assignedToId: admin.id } }),
      prisma.serviceRequest.count({ where: { ...base, status: SR_STATUS.ABIERTA } }),
    ]),
  ]);
  const [activeCount, unassigned, mine, fresh] = counts;
  return { rows, counts: { active: activeCount, unassigned, mine, fresh } };
}

/** Personas del estudio a las que se puede asignar una solicitud. */
export async function listStaff(admin: CurrentUser) {
  assertAdmin(admin);
  return prisma.user.findMany({
    where: { studyId: admin.studyId, role: ROLES.ADMIN, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * El cliente informa el pago de un vencimiento con el comprobante adjunto.
 * Crea una solicitud "Pago informado" para que el estudio lo verifique y pasa el vencimiento a PAGO_INFORMADO.
 * No se marca como pagado: eso lo hace el estudio al verificarlo.
 */
export async function informPayment(
  user: CurrentUser,
  obligationId: string,
  noteInput: string,
  files: UploadFile[],
  origin: string,
): Promise<RequestResult> {
  const obligation = await prisma.obligation.findFirst({ where: { id: obligationId, studyId: user.studyId } });
  const taxpayer = obligation ? await getAuthorizedTaxpayer(user, obligation.taxpayerId) : null;
  if (!obligation || !taxpayer) return { ok: false, message: "El vencimiento no existe o no tenés acceso." };
  if (obligation.status !== OBLIGATION_STATUS.PENDIENTE) {
    return { ok: false, message: "Este vencimiento ya no está pendiente de pago." };
  }

  const note = noteInput.trim();
  const fieldErrors: Record<string, string> = {};
  if (note.length > 1000) fieldErrors.note = "Máximo 1.000 caracteres.";
  if (files.length === 0) fieldErrors.files = "Adjuntá el comprobante de pago (PDF, PNG o JPG).";
  const checked = checkFiles(files);
  if (!checked.ok) fieldErrors.files = checked.message;
  if (Object.keys(fieldErrors).length > 0 || !checked.ok) return { ok: false, message: "Revisá los campos marcados.", fieldErrors };

  const { year, month } = parseYmd(`${obligation.period}-01`);
  const periodText = `${obligation.concept} de ${monthLabelLong(year, month)}`;
  const body = note || `Informo el pago de ${periodText}. Adjunto el comprobante.`;
  const stored = await storeFiles(checked.files);
  const request = await withStoredFiles(stored, () =>
    prisma.$transaction(async (tx) => {
      // Cambio condicionado: si otra persona lo informó o el estudio lo cambió recién, no se pisa.
      const moved = await tx.obligation.updateMany({
        where: { id: obligation.id, status: OBLIGATION_STATUS.PENDIENTE },
        data: {
          status: OBLIGATION_STATUS.PAGO_INFORMADO,
          statusNote: `Informado por ${user.name} el ${formatDateAR(todayAR())}, con comprobante adjunto. Falta que el estudio lo verifique.`,
          updatedById: user.id,
        },
      });
      if (moved.count === 0) throw new PaymentConflict();
      const request = await tx.serviceRequest.create({
        data: {
          studyId: user.studyId,
          taxpayerId: taxpayer.id,
          createdById: user.id,
          topic: "PAGO",
          subject: `Pago informado: ${periodText}`,
          status: SR_STATUS.ABIERTA,
          obligationId: obligation.id,
        },
      });
      await createMessage(tx, {
        request,
        authorId: user.id,
        body,
        visibility: MESSAGE_VISIBILITY.PUBLICA,
        channel: CHANNEL.WEB,
        files: stored,
        category: "COMPROBANTE_PAGO",
        obligationId: obligation.id,
      });
      await tx.auditEvent.create({
        data: {
          studyId: user.studyId,
          actorId: user.id,
          action: "OBLIGATION_PAYMENT_INFORMED",
          entity: "Obligation",
          entityId: obligation.id,
          detail: `${taxpayer.name}: ${periodText} · pago informado por el cliente con ${stored.length} comprobante(s)`,
        },
      });
      return request;
    }),
  ).catch((err) => {
    if (err instanceof PaymentConflict) return null;
    throw err;
  });
  if (!request) return { ok: false, message: "Este vencimiento ya no está pendiente de pago." };

  await notify(
    await staffRecipients(user.studyId, null),
    `Pago informado: ${taxpayer.name}`,
    `${user.name} informó el pago de ${periodText} (${taxpayer.name}) y adjuntó el comprobante.\n\nVerificarlo:\n${origin}/admin/solicitudes/${request.id}`,
  );
  return { ok: true, message: "Pago informado. El estudio va a revisar el comprobante.", requestId: request.id };
}

class PaymentConflict extends Error {}
