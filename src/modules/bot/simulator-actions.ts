"use server";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getOrigin } from "@/lib/origin";
import { simulatorTransport } from "@/providers/messaging";
import { receiveInbound, retryPendingInbound, type InboundOutcome } from "./inbound";
import { isSimulatorAddress, simulatorEnabled } from "./simulator-config";

// Acciones del simulador local de WhatsApp. Reemplazan solo el transporte: el mensaje entra por la misma
// recepción (guardado, deduplicación, cola por número) y el mismo motor que usa el webhook real, contra la
// misma base. Solo en modo DEMO fuera de producción y solo con los números ficticios del simulador.

function guard(address: string) {
  if (!simulatorEnabled()) throw new Error("El simulador no está disponible en este entorno.");
  if (!isSimulatorAddress(address)) throw new Error("El simulador solo acepta sus números de prueba.");
}

export type SimulatorResult = { outcome: InboundOutcome; providerId: string };

/** Envía un mensaje como si llegara por WhatsApp. `repeatOf` reenvía el mismo id (evento duplicado). */
export async function simulatorSend(
  address: string,
  text: string,
  opts: { repeatOf?: string; fault?: "antes" | "despues" } = {},
): Promise<SimulatorResult> {
  guard(address);
  const providerId = opts.repeatOf ?? `sim-${randomUUID()}`;
  const outcome = await receiveInbound(
    { provider: "SIMULADOR", providerId, rawAddress: address.replace(/^\+/, ""), text },
    { transport: simulatorTransport, origin: await getOrigin(), fault: opts.fault },
  );
  return { outcome, providerId };
}

/** Dos entregas simultáneas del mismo evento: debe procesarse una sola vez. */
export async function simulatorConcurrent(address: string, text: string): Promise<InboundOutcome[]> {
  guard(address);
  const providerId = `sim-${randomUUID()}`;
  const options = { transport: simulatorTransport, origin: await getOrigin() };
  const input = { provider: "SIMULADOR" as const, providerId, rawAddress: address.replace(/^\+/, ""), text };
  return Promise.all([receiveInbound(input, options), receiveInbound(input, options)]);
}

/** Reintenta los eventos del simulador que quedaron fallidos. */
export async function simulatorRetry(address: string): Promise<number> {
  guard(address);
  return retryPendingInbound({ transport: simulatorTransport, origin: await getOrigin() }, 20, "SIMULADOR");
}

export type TranscriptItem = { id: string; dir: "in" | "out"; text: string; at: string; status: string; providerId?: string };

/** Conversación del número, leída de la base (sobrevive a reinicios del servidor). */
export async function simulatorTranscript(address: string): Promise<TranscriptItem[]> {
  guard(address);
  const [inbound, outbound] = await Promise.all([
    prisma.inboundEvent.findMany({ where: { address }, orderBy: { receivedAt: "asc" }, take: 200 }),
    prisma.outboundMessage.findMany({ where: { address }, orderBy: { createdAt: "asc" }, take: 300 }),
  ]);
  const items: TranscriptItem[] = [
    ...inbound.map((e) => ({ id: e.id, dir: "in" as const, text: e.body, at: e.receivedAt.toISOString(), status: e.status, providerId: e.providerId })),
    ...outbound.map((o) => ({ id: o.id, dir: "out" as const, text: o.body, at: o.createdAt.toISOString(), status: o.status })),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at) || (a.dir === "in" ? -1 : 1));
}
