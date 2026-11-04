import { prisma } from "@/lib/db";
import { CHANNEL } from "@/lib/constants";
import { simulatorTransport, whatsappTransport, type MessagingTransport } from "@/providers/messaging";
import { isSimulatorAddress, simulatorEnabled } from "./simulator-config";

// Avisos que el bot manda por su cuenta (sin que el cliente haya escrito antes).
// Sin dependencias del motor ni de las solicitudes, para que el servicio de solicitudes pueda usarlo.
// Ojo: WhatsApp solo deja mandar texto libre dentro de las 24 h del último mensaje del cliente;
// fuera de esa ventana hace falta una plantilla aprobada por Meta y el envío queda FALLIDO o PENDIENTE.

/** Transporte para avisos: Meta si está configurado; en el simulador local, los números de prueba; si no, pendiente. */
export function noticeTransport(address: string): MessagingTransport {
  const real = whatsappTransport();
  if (real.name === "META") return real;
  if (simulatorEnabled() && isSimulatorAddress(address)) return simulatorTransport;
  return real;
}

/** Aviso al cliente cuando el estudio responde una solicitud que llegó por WhatsApp. */
export async function notifyRequestReply(
  request: { id: string; subject: string; channel: string; createdById: string },
  transport?: MessagingTransport,
): Promise<void> {
  if (request.channel !== CHANNEL.WHATSAPP) return;
  const link = await prisma.channelLink.findFirst({ where: { userId: request.createdById, channel: CHANNEL.WHATSAPP, status: "ACTIVO" } });
  if (!link) return;
  const body = `El estudio respondió tu solicitud *${request.subject}*. Escribí *6* para verla.`;
  const row = await prisma.outboundMessage.create({
    data: { channel: CHANNEL.WHATSAPP, address: link.address, body, kind: "AVISO", requestId: request.id, status: "PENDIENTE" },
  });
  const result = await (transport ?? noticeTransport(link.address)).send(link.address, body);
  await prisma.outboundMessage.update({
    where: { id: row.id },
    data: { status: result.status, providerId: result.providerId ?? null, error: result.error ?? null, attempts: 1, sentAt: result.status === "ENVIADO" || result.status === "SIMULADO" ? new Date() : null },
  });
}
