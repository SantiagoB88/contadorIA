"use server";

import { randomUUID } from "node:crypto";
import { usesBundledDemo } from "@/lib/vercel-demo";
import { prisma } from "@/lib/db";
import { getOrigin } from "@/lib/origin";
import { getCurrentUser } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { seedDemo } from "@/modules/demo/seed-data";
import { simulatorTransport } from "@/providers/messaging";
import { receiveInbound, retryPendingInbound, type InboundOutcome } from "./inbound";
import { isSimulatorAddress, simulatorEnabled } from "./simulator-config";
import { saveBotUpload } from "./uploads";
import type { BotMessage } from "./ui";

// Acciones del simulador local de WhatsApp. Reemplazan solo el transporte: el mensaje entra por la misma
// recepción (guardado, deduplicación, cola por número) y el mismo motor que usa el webhook real, contra la
// misma base. Solo en modo DEMO fuera de producción y solo con los números ficticios del simulador.

// Cada acción vuelve a validar: entorno, sesión iniciada y número ficticio. La sesión de la web no decide quién
// escribe en el chat (eso lo da el número ficticio, como en WhatsApp); solo impide usar el simulador sin ingresar.
async function guard(address: string) {
  if (!simulatorEnabled()) throw new Error("El simulador no está disponible en este entorno.");
  if (!(await getCurrentUser())) throw new Error("Ingresá a la web para usar el simulador.");
  if (!isSimulatorAddress(address)) throw new Error("El simulador solo acepta sus números de prueba.");
}

export type SimulatorResult = { outcome: InboundOutcome; providerId: string };

/**
 * Envía un mensaje como si llegara por WhatsApp: un texto o una opción tocada (`choiceId`, con su título como
 * texto, igual que lo manda WhatsApp). `repeatOf` reenvía el mismo id (evento duplicado).
 */
export async function simulatorSend(
  address: string,
  text: string,
  opts: { choiceId?: string; repeatOf?: string; fault?: "antes" | "despues" } = {},
): Promise<SimulatorResult> {
  await guard(address);
  const providerId = opts.repeatOf ?? `sim-${randomUUID()}`;
  let choiceId = opts.choiceId ?? null;
  let uploadId: string | null = null;
  let uploadError: string | null = null;
  if (opts.repeatOf) {
    // Un reenvío lleva exactamente lo mismo que el original.
    const original = await prisma.inboundEvent.findUnique({ where: { provider_providerId: { provider: "SIMULADOR", providerId: opts.repeatOf } } });
    choiceId = original?.choiceId ?? choiceId;
    uploadId = original?.uploadId ?? null;
    uploadError = original?.uploadError ?? null;
  }
  const outcome = await receiveInbound(
    { provider: "SIMULADOR", providerId, rawAddress: address.replace(/^\+/, ""), text, choiceId, uploadId, uploadError },
    { transport: simulatorTransport, origin: await getOrigin(), fault: opts.fault },
  );
  return { outcome, providerId };
}

/** Envía un archivo (foto o PDF) como si llegara por WhatsApp. Se valida igual que en el webhook. */
export async function simulatorUpload(address: string, form: FormData): Promise<SimulatorResult> {
  await guard(address);
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Elegí un archivo.");
  const caption = String(form.get("caption") ?? "");
  const saved = await saveBotUpload(address, { name: file.name || null, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
  const providerId = `sim-${randomUUID()}`;
  const outcome = await receiveInbound(
    {
      provider: "SIMULADOR",
      providerId,
      rawAddress: address.replace(/^\+/, ""),
      text: caption,
      ...(saved.ok ? { uploadId: saved.id } : { uploadError: saved.message }),
    },
    { transport: simulatorTransport, origin: await getOrigin() },
  );
  return { outcome, providerId };
}

/** Dos entregas simultáneas del mismo evento: debe procesarse una sola vez. */
export async function simulatorConcurrent(address: string, text: string, choiceId?: string): Promise<InboundOutcome[]> {
  await guard(address);
  const providerId = `sim-${randomUUID()}`;
  const options = { transport: simulatorTransport, origin: await getOrigin() };
  const input = { provider: "SIMULADOR" as const, providerId, rawAddress: address.replace(/^\+/, ""), text, choiceId: choiceId ?? null };
  return Promise.all([receiveInbound(input, options), receiveInbound(input, options)]);
}

/**
 * Deja un número ficticio como recién llegado: desvincula su WhatsApp (con registro en la auditoría) y borra su
 * conversación y su historial de mensajes. Solo para los números del simulador.
 */
export async function simulatorReset(address: string): Promise<string> {
  await guard(address);
  const links = await prisma.channelLink.findMany({ where: { address, status: "ACTIVO" } });
  for (const link of links) {
    await prisma.$transaction([
      prisma.channelLink.update({
        where: { id: link.id },
        data: { status: "DESVINCULADO", activeKey: null, unlinkedAt: new Date(), unlinkReason: "Reinicio del simulador (DEMO)" },
      }),
      prisma.auditEvent.create({
        data: { studyId: link.studyId, actorId: null, action: "CHANNEL_UNLINK", entity: "User", entityId: link.userId, detail: "Reinicio del simulador (DEMO)" },
      }),
    ]);
  }
  await prisma.$transaction([
    prisma.botConversation.deleteMany({ where: { address } }),
    prisma.outboundMessage.deleteMany({ where: { address } }),
    prisma.inboundEvent.deleteMany({ where: { address } }),
    prisma.linkCode.deleteMany({ where: { address } }),
  ]);
  return links.length ? "Número reiniciado: se desvinculó y se borró la conversación." : "Número reiniciado: se borró la conversación.";
}

/**
 * Vuelve toda la demo a los datos de ejemplo: borra lo que se creó (usuarios nuevos, solicitudes, facturas, archivos,
 * conversaciones) y carga los datos iniciales. Solo un administrador y solo donde existe el simulador (modo DEMO).
 * Cierra todas las sesiones, la propia también.
 */
export async function simulatorResetDemo(): Promise<string> {
  if (!simulatorEnabled()) throw new Error("El simulador no está disponible en este entorno.");
  const user = await getCurrentUser();
  if (!user || user.role !== ROLES.ADMIN) throw new Error("Solo un administrador puede restablecer la demo.");
  await seedDemo({ reset: true });
  return "Demo restablecida con los datos de ejemplo. Volvé a ingresar.";
}

/** Reintenta los eventos del simulador que quedaron fallidos. */
export async function simulatorRetry(address: string): Promise<number> {
  await guard(address);
  return retryPendingInbound({ transport: simulatorTransport, origin: await getOrigin() }, 20, "SIMULADOR");
}

export type TranscriptItem = {
  id: string;
  dir: "in" | "out";
  text: string;
  at: string;
  status: string;
  providerId?: string;
  message?: BotMessage; // respuesta con botones o lista
  choice?: boolean; // entrada: fue una opción tocada
  file?: string; // entrada: nombre del archivo
};

// Identifica la copia de la base de demo de esta instancia (una por proceso en Vercel).
const instance = globalThis as unknown as { contadorSmartDemoInstance?: string };

/**
 * En la demo de Vercel, qué copia de la base atiende. Si cambia, Vercel reinició la demo (o abrió otra copia) y los
 * datos volvieron a los de ejemplo: el simulador lo avisa. En la compu la base es una sola y devuelve null.
 */
export async function simulatorInstance(): Promise<string | null> {
  if (!simulatorEnabled()) throw new Error("El simulador no está disponible en este entorno.");
  if (!usesBundledDemo) return null;
  instance.contadorSmartDemoInstance ??= randomUUID();
  return instance.contadorSmartDemoInstance;
}

/** Conversación del número, leída de la base (sobrevive a reinicios del servidor). */
export async function simulatorTranscript(address: string): Promise<TranscriptItem[]> {
  await guard(address);
  const [inbound, outbound] = await Promise.all([
    prisma.inboundEvent.findMany({ where: { address }, orderBy: { receivedAt: "asc" }, take: 200 }),
    prisma.outboundMessage.findMany({ where: { address }, orderBy: { createdAt: "asc" }, take: 300 }),
  ]);
  const uploadIds = inbound.map((e) => e.uploadId).filter((x): x is string => !!x);
  const uploads = uploadIds.length ? await prisma.botUpload.findMany({ where: { id: { in: uploadIds } }, select: { id: true, fileName: true } }) : [];
  const items: TranscriptItem[] = [
    ...inbound.map((e) => ({
      id: e.id,
      dir: "in" as const,
      text: e.body,
      at: e.receivedAt.toISOString(),
      status: e.status,
      providerId: e.providerId,
      ...(e.choiceId ? { choice: true } : {}),
      ...(e.uploadId ? { file: uploads.find((u) => u.id === e.uploadId)?.fileName ?? "archivo" } : {}),
    })),
    ...outbound.map((o) => {
      let message: BotMessage | undefined;
      try {
        message = o.payload ? (JSON.parse(o.payload) as BotMessage) : undefined;
      } catch {
        message = undefined;
      }
      return { id: o.id, dir: "out" as const, text: o.body, at: o.createdAt.toISOString(), status: o.status, ...(message ? { message } : {}) };
    }),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at) || (a.dir === "in" ? -1 : 1));
}
