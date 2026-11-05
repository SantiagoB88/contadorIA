"use server";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getOrigin } from "@/lib/origin";
import { getCurrentUser } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { seedDemo } from "@/modules/demo/seed-data";
import { forgetDemoAccounts, restoreDemoAccounts } from "@/lib/demo-accounts";
import { simulatorTransport } from "@/providers/messaging";
import { receiveInbound, retryPendingInbound, type InboundOutcome } from "./inbound";
import { isSimulatorAddress, simulatorEnabled } from "./simulator-config";
import { saveBotUpload } from "./uploads";
import { exportChat, importChat } from "./simulator-backup";
import type { BotMessage } from "./ui";

// Acciones del simulador local de WhatsApp. Reemplazan solo el transporte: el mensaje entra por la misma
// recepción (guardado, deduplicación, cola por número) y el mismo motor que usa el webhook real, contra la
// misma base. Solo en modo DEMO fuera de producción y solo con los números ficticios del simulador.

// Cada acción vuelve a validar: entorno, sesión iniciada y número ficticio. La sesión de la web no decide quién
// escribe en el chat (eso lo da el número ficticio, como en WhatsApp); solo impide usar el simulador sin ingresar.
// `backup`: en la demo de Vercel, la copia de la conversación que guarda el navegador (ver simulator-backup.ts). La
// copia del servidor que atiende la reconstruye si le falta, y cada acción devuelve la copia actualizada.
async function guard(address: string, backup?: string | null) {
  if (!simulatorEnabled()) throw new Error("El simulador no está disponible en este entorno.");
  if (!(await getCurrentUser())) throw new Error("Ingresá a la web para usar el simulador.");
  if (!isSimulatorAddress(address)) throw new Error("El simulador solo acepta sus números de prueba.");
  await restoreDemoAccounts(); // demo de Vercel: cuentas creadas en otra copia del servidor
  await importChat(address, backup);
}

export type SimulatorResult = { outcome: InboundOutcome; providerId: string; backup: string | null };

/**
 * Envía un mensaje como si llegara por WhatsApp: un texto o una opción tocada (`choiceId`, con su título como
 * texto, igual que lo manda WhatsApp). `repeatOf` reenvía el mismo id (evento duplicado).
 */
export async function simulatorSend(
  address: string,
  text: string,
  opts: { choiceId?: string; repeatOf?: string; fault?: "antes" | "despues" } = {},
  backup?: string | null,
): Promise<SimulatorResult> {
  await guard(address, backup);
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
  return { outcome, providerId, backup: await exportChat(address) };
}

/** Envía un archivo (foto o PDF) como si llegara por WhatsApp. Se valida igual que en el webhook. */
export async function simulatorUpload(address: string, form: FormData): Promise<SimulatorResult> {
  await guard(address, form.get("backup") ? String(form.get("backup")) : null);
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
  return { outcome, providerId, backup: await exportChat(address) };
}

/** Dos entregas simultáneas del mismo evento: debe procesarse una sola vez. */
export async function simulatorConcurrent(
  address: string,
  text: string,
  choiceId?: string,
  backup?: string | null,
): Promise<{ outcomes: InboundOutcome[]; backup: string | null }> {
  await guard(address, backup);
  const providerId = `sim-${randomUUID()}`;
  const options = { transport: simulatorTransport, origin: await getOrigin() };
  const input = { provider: "SIMULADOR" as const, providerId, rawAddress: address.replace(/^\+/, ""), text, choiceId: choiceId ?? null };
  const outcomes = await Promise.all([receiveInbound(input, options), receiveInbound(input, options)]);
  return { outcomes, backup: await exportChat(address) };
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
  // En Vercel cada copia del servidor tiene su propia base: restablecer una sola las desincronizaría.
  if (process.env.VERCEL) throw new Error("En la demo online los datos vuelven solos a los de ejemplo cuando se reinicia.");
  await seedDemo({ reset: true });
  await forgetDemoAccounts();
  return "Demo restablecida con los datos de ejemplo. Volvé a ingresar.";
}

/** Reintenta los eventos del simulador que quedaron fallidos. */
export async function simulatorRetry(address: string, backup?: string | null): Promise<{ count: number; backup: string | null }> {
  await guard(address, backup);
  const count = await retryPendingInbound({ transport: simulatorTransport, origin: await getOrigin() }, 20, "SIMULADOR");
  return { count, backup: await exportChat(address) };
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

/** Conversación del número, leída de la base (y, en la demo de Vercel, de la copia del navegador). */
export async function simulatorTranscript(address: string, backup?: string | null): Promise<{ items: TranscriptItem[]; backup: string | null }> {
  await guard(address, backup);
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
  items.sort((a, b) => a.at.localeCompare(b.at) || (a.dir === "in" ? -1 : 1));
  return { items, backup: await exportChat(address) };
}
