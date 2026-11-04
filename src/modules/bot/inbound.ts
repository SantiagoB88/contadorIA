import { prisma } from "@/lib/db";
import { CHANNEL } from "@/lib/constants";
import { normalizePhone } from "@/lib/phone";
import type { MessagingTransport } from "@/providers/messaging";
import { handleMessage } from "./engine";
import { T } from "./copy";
import { textMessage, type BotMessage } from "./ui";

// Recepción de mensajes del canal, común al webhook de WhatsApp y al simulador local.
// 1. El evento se guarda ANTES de procesarlo. El id del proveedor es único: un reenvío se descarta.
// 2. Los mensajes de un mismo número se procesan de a uno (en orden de llegada a este servidor).
// 3. Si el procesamiento falla, el evento queda FALLIDO y se reintenta hasta MAX_ATTEMPTS veces.
//    Las acciones con efecto usan el id del evento como clave de idempotencia: un reintento no duplica.
// 4. Cada respuesta se registra como mensaje saliente con su estado real (enviado, pendiente, fallido).
// Los logs no incluyen el texto de los mensajes.

export const MAX_ATTEMPTS = 3;

export type InboundInput = {
  provider: "META" | "SIMULADOR";
  providerId: string;
  rawAddress: string; // tal como lo informa el canal (WhatsApp: dígitos sin "+")
  text: string;
  choiceId?: string | null; // opción tocada (botón o fila de lista)
  uploadId?: string | null; // archivo ya validado y guardado (BotUpload)
  uploadError?: string | null; // archivo rechazado: el motivo se le explica a la persona (no se guarda en el evento)
};

export type InboundOptions = {
  transport: MessagingTransport;
  origin: string;
  fault?: "antes" | "despues"; // solo simulador
};

export type InboundOutcome =
  | { status: "duplicado" }
  | { status: "invalido" }
  | { status: "procesado"; replies: BotMessage[] }
  | { status: "fallido"; error: string };

// Cola por número: dos mensajes simultáneos del mismo número no se pisan.
const queues = (globalThis as unknown as { botQueues?: Map<string, Promise<unknown>> }).botQueues ?? new Map<string, Promise<unknown>>();
(globalThis as unknown as { botQueues?: Map<string, Promise<unknown>> }).botQueues = queues;

function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  queues.set(
    key,
    run.finally(() => {
      if (queues.get(key) === run) queues.delete(key);
    }),
  );
  return run;
}

async function deliver(address: string, replies: BotMessage[], inboundId: string, transport: MessagingTransport) {
  for (const message of replies) {
    const row = await prisma.outboundMessage.create({
      data: {
        channel: CHANNEL.WHATSAPP,
        address,
        body: message.text,
        payload: message.kind === "text" ? null : JSON.stringify(message),
        kind: "RESPUESTA",
        inboundId,
        status: "PENDIENTE",
      },
    });
    const result = await transport.send(address, message);
    await prisma.outboundMessage.update({
      where: { id: row.id },
      data: {
        status: result.status,
        providerId: result.providerId ?? null,
        error: result.error ?? null,
        attempts: { increment: 1 },
        sentAt: result.status === "ENVIADO" || result.status === "SIMULADO" ? new Date() : null,
      },
    });
  }
}

async function processEvent(eventId: string, options: InboundOptions, uploadError?: string | null): Promise<InboundOutcome> {
  const event = await prisma.inboundEvent.findUniqueOrThrow({ where: { id: eventId } });
  try {
    const upload = event.uploadId ? await prisma.botUpload.findUnique({ where: { id: event.uploadId } }) : null;
    const replies = await handleMessage({
      channel: CHANNEL.WHATSAPP,
      address: event.address,
      text: event.body,
      choiceId: event.choiceId,
      upload: upload && upload.address === event.address ? { id: upload.id, fileName: upload.fileName } : null,
      uploadError,
      eventRef: event.id,
      origin: options.origin,
      fault: options.fault,
    });
    await prisma.inboundEvent.update({ where: { id: event.id }, data: { status: "PROCESADO", processedAt: new Date(), attempts: { increment: 1 } } });
    await deliver(event.address, replies, event.id, options.transport);
    return { status: "procesado", replies };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    const updated = await prisma.inboundEvent.update({
      where: { id: event.id },
      data: { status: "FALLIDO", lastError: message.slice(0, 300), attempts: { increment: 1 } },
    });
    console.error(`[bot] Falló el evento ${event.id} (intento ${updated.attempts}): ${message}`);
    // Se avisa una sola vez, en el primer fallo. No se dice que falló la operación: puede haber quedado guardada.
    if (updated.attempts === 1) await deliver(event.address, [textMessage(T.verifying)], event.id, options.transport).catch(() => undefined);
    return { status: "fallido", error: message };
  }
}

/** ¿Ya se recibió este mensaje? (para no descargar dos veces un adjunto reenviado por el proveedor) */
export async function alreadyReceived(provider: InboundInput["provider"], providerId: string): Promise<boolean> {
  return (await prisma.inboundEvent.count({ where: { provider, providerId } })) > 0;
}

/** Recibe un mensaje del canal. Idempotente por (proveedor, id del mensaje). */
export async function receiveInbound(input: InboundInput, options: InboundOptions): Promise<InboundOutcome> {
  const address = normalizePhone(input.rawAddress);
  if (!address) return { status: "invalido" };

  let eventId: string;
  try {
    const event = await prisma.inboundEvent.create({
      data: {
        provider: input.provider,
        providerId: input.providerId,
        channel: CHANNEL.WHATSAPP,
        address,
        body: input.text.slice(0, 4096),
        choiceId: input.choiceId?.slice(0, 256) ?? null,
        uploadId: input.uploadId ?? null,
        status: "RECIBIDO",
      },
    });
    eventId = event.id;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return { status: "duplicado" };
    throw err;
  }
  return serialize(address, () => processEvent(eventId, options, input.uploadError));
}

/** Reintenta eventos fallidos (o que quedaron sin procesar por una caída) con menos de MAX_ATTEMPTS intentos. */
export async function retryPendingInbound(options: InboundOptions, limit = 20, provider?: InboundInput["provider"]): Promise<number> {
  const stale = new Date(Date.now() - 60_000); // RECIBIDO hace más de un minuto: el proceso se cortó
  const events = await prisma.inboundEvent.findMany({
    where: {
      attempts: { lt: MAX_ATTEMPTS },
      ...(provider ? { provider } : {}),
      OR: [{ status: "FALLIDO" }, { status: "RECIBIDO", receivedAt: { lt: stale } }],
    },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });
  for (const e of events) await serialize(e.address, () => processEvent(e.id, options));
  return events.length;
}
