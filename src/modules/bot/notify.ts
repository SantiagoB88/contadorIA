import { prisma } from "@/lib/db";
import { CHANNEL, SR_STATUS_LABEL } from "@/lib/constants";
import { simulatorTransport, whatsappTransport, type MessagingTransport } from "@/providers/messaging";
import { requestCode } from "@/lib/request-code";
import { formatCuit } from "@/lib/cuit";
import { textMessage, type BotMessage } from "./ui";
import { isSimulatorAddress, simulatorEnabled } from "./simulator-config";

// Avisos que el bot manda por su cuenta (sin que el cliente haya escrito antes), según las preferencias del usuario.
// Solo existen los tipos con un envío real implementado. Los recordatorios de vencimientos NO están implementados
// (no hay un proceso periódico que los mande) y por eso no se ofrecen como activables.
// Ojo: WhatsApp solo deja mandar mensajes libres dentro de las 24 h del último mensaje del cliente; fuera de esa
// ventana hace falta una plantilla aprobada por Meta (no implementado) y el envío queda FALLIDO.

export const NOTICE_TYPES = [
  { type: "RESPUESTAS_ESTUDIO", label: "Respuestas del estudio", short: "respuestas" },
  { type: "CAMBIOS_ESTADO", label: "Cambios de estado de tus solicitudes", short: "estados" },
] as const;

export async function getPreferences(userId: string): Promise<Record<string, boolean>> {
  const rows = await prisma.notificationPreference.findMany({ where: { userId, channel: CHANNEL.WHATSAPP } });
  const prefs: Record<string, boolean> = {};
  for (const t of NOTICE_TYPES) prefs[t.type] = rows.find((r) => r.type === t.type)?.enabled ?? true; // activados por defecto
  return prefs;
}

export async function setPreference(userId: string, type: string, enabled: boolean) {
  await prisma.notificationPreference.upsert({
    where: { userId_channel_type: { userId, channel: CHANNEL.WHATSAPP, type } },
    update: { enabled },
    create: { userId, channel: CHANNEL.WHATSAPP, type, enabled },
  });
}

/** Transporte para avisos: Meta si está configurado; en el simulador local, los números de prueba; si no, pendiente. */
export function noticeTransport(address: string): MessagingTransport {
  const real = whatsappTransport();
  if (real.name === "META") return real;
  if (simulatorEnabled() && isSimulatorAddress(address)) return simulatorTransport;
  return real;
}

type RequestRef = { id: string; subject: string; channel: string; createdById: string };

async function sendNotice(request: RequestRef, type: string, message: BotMessage, transport?: MessagingTransport) {
  if (request.channel !== CHANNEL.WHATSAPP) return;
  const link = await prisma.channelLink.findFirst({ where: { userId: request.createdById, channel: CHANNEL.WHATSAPP, status: "ACTIVO" } });
  if (!link) return;
  if (!(await getPreferences(request.createdById))[type]) return;
  const row = await prisma.outboundMessage.create({
    data: {
      channel: CHANNEL.WHATSAPP,
      address: link.address,
      body: message.text,
      payload: message.kind === "text" ? null : JSON.stringify(message),
      kind: "AVISO",
      requestId: request.id,
      status: "PENDIENTE",
    },
  });
  const result = await (transport ?? noticeTransport(link.address)).send(link.address, message);
  await prisma.outboundMessage.update({
    where: { id: row.id },
    data: {
      status: result.status,
      providerId: result.providerId ?? null,
      error: result.error ?? null,
      attempts: 1,
      sentAt: result.status === "ENVIADO" || result.status === "SIMULADO" ? new Date() : null,
    },
  });
}

/** El estudio respondió en público una solicitud que llegó por WhatsApp. No incluye el texto: se lee en el bot. */
export async function notifyRequestReply(request: RequestRef, transport?: MessagingTransport): Promise<void> {
  // Sin botones: un aviso proactivo no tiene opciones vigentes; el cliente escribe "menú" o Mis solicitudes.
  await sendNotice(
    request,
    "RESPUESTAS_ESTUDIO",
    textMessage(`El estudio respondió tu solicitud ${requestCode(request.id)} (${request.subject}). Para verla, escribí *menú* y entrá a Mis solicitudes.`),
    transport,
  );
}

/** El estudio cambió el estado de una solicitud que llegó por WhatsApp. */
export async function notifyRequestStatus(request: RequestRef, status: string, transport?: MessagingTransport): Promise<void> {
  await sendNotice(
    request,
    "CAMBIOS_ESTADO",
    textMessage(`Tu solicitud ${requestCode(request.id)} (${request.subject}) cambió a: ${SR_STATUS_LABEL[status] ?? status}.`),
    transport,
  );
}

/** El estudio aprobó o rechazó una solicitud de acceso: se avisa por WhatsApp si la persona tiene el número vinculado. */
export async function notifyAccessReviewed(
  userId: string,
  review: { approved: boolean; taxpayerName: string; cuit: string; note?: string | null },
  transport?: MessagingTransport,
): Promise<void> {
  const link = await prisma.channelLink.findFirst({ where: { userId, channel: CHANNEL.WHATSAPP, status: "ACTIVO" } });
  if (!link) return;
  const body = review.approved
    ? `¡Buenas noticias! El estudio aprobó tu acceso a ${review.taxpayerName} (CUIT ${formatCuit(review.cuit)}). Escribí *menú* para ver tu información.`
    : `El estudio no aprobó tu solicitud para el CUIT ${formatCuit(review.cuit)}.${review.note ? ` Motivo: ${review.note}.` : ""} Escribí *menú* para consultar al estudio.`;
  const row = await prisma.outboundMessage.create({
    data: { channel: CHANNEL.WHATSAPP, address: link.address, body, kind: "AVISO", status: "PENDIENTE" },
  });
  const result = await (transport ?? noticeTransport(link.address)).send(link.address, textMessage(body));
  await prisma.outboundMessage.update({
    where: { id: row.id },
    data: {
      status: result.status,
      providerId: result.providerId ?? null,
      error: result.error ?? null,
      attempts: 1,
      sentAt: result.status === "ENVIADO" || result.status === "SIMULADO" ? new Date() : null,
    },
  });
}

export { requestCode };
