import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { prisma } from "@/lib/db";
import { demoSecret } from "@/lib/demo-secret";
import { usesBundledDemo } from "@/lib/vercel-demo";

// Copia de la conversación del simulador en el navegador (solo en la demo de Vercel).
// En Vercel cada copia del servidor tiene su propia base y Vercel las recicla seguido: una conversación a medio camino
// (por ejemplo, el alta) se perdía al actualizar la página o al tocar una opción si atendía otra copia. Cada acción del
// simulador devuelve la conversación cifrada; el navegador la guarda y la manda en la siguiente, y la copia que atiende
// la reconstruye si le falta o la tiene más vieja. Cifrada con AES-GCM y una clave derivada del secreto de la demo, y
// atada al número: nadie puede leerla, fabricarla ni usarla para otro número.
// En la compu y en una instalación real no se usa (la base es una sola).

const MAX_INBOUND = 200; // lo mismo que muestra el simulador
const MAX_OUTBOUND = 300;

type Row = Record<string, unknown>;
type ChatSnapshot = {
  address: string;
  conversations: Row[];
  inbound: Row[];
  outbound: Row[];
  linkCodes: Row[];
};

// Campos de fecha de cada tabla (se guardan como texto ISO).
const DATES: Record<keyof Omit<ChatSnapshot, "address">, string[]> = {
  conversations: ["updatedAt"],
  inbound: ["receivedAt", "processedAt"],
  outbound: ["createdAt", "sentAt"],
  linkCodes: ["expiresAt", "usedAt", "createdAt"],
};

const keyFor = (secret: string) => createHash("sha256").update(`${secret}:chat-demo`).digest();

function revive(rows: Row[], fields: string[]): Row[] {
  return rows.map((r) => {
    const out: Row = { ...r };
    for (const f of fields) if (typeof out[f] === "string") out[f] = new Date(out[f] as string);
    return out;
  });
}

/** Conversación del número, cifrada para guardarla en el navegador. null fuera de la demo de Vercel. */
export async function exportChat(address: string): Promise<string | null> {
  if (!usesBundledDemo) return null;
  const secret = await demoSecret();
  if (!secret) return null;
  const [conversations, inbound, outbound, linkCodes] = await Promise.all([
    prisma.botConversation.findMany({ where: { address } }),
    prisma.inboundEvent.findMany({ where: { address }, orderBy: { receivedAt: "desc" }, take: MAX_INBOUND }),
    prisma.outboundMessage.findMany({ where: { address }, orderBy: { createdAt: "desc" }, take: MAX_OUTBOUND }),
    prisma.linkCode.findMany({ where: { address, usedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  const snap: ChatSnapshot = { address, conversations, inbound, outbound, linkCodes };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const encrypted = Buffer.concat([cipher.update(deflateRawSync(Buffer.from(JSON.stringify(snap)))), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function decrypt(blob: string, secret: string): ChatSnapshot | null {
  try {
    const data = Buffer.from(blob, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
    return JSON.parse(inflateRawSync(plain).toString("utf8")) as ChatSnapshot;
  } catch {
    return null; // alterada, de otro deploy o vieja: se ignora
  }
}

/**
 * Reconstruye en esta copia del servidor la conversación que trae el navegador, si acá falta o está más vieja.
 * Nunca pisa algo más nuevo de esta copia. Devuelve si cambió algo.
 */
export async function importChat(address: string, blob: string | null | undefined): Promise<boolean> {
  if (!usesBundledDemo || !blob) return false;
  const secret = await demoSecret();
  const snap = secret ? decrypt(blob, secret) : null;
  if (!snap || snap.address !== address) return false;
  let changed = false;

  for (const c of revive(snap.conversations, DATES.conversations)) {
    const existing = await prisma.botConversation.findUnique({
      where: { channel_address: { channel: String(c.channel), address } },
    });
    if (existing && existing.updatedAt >= (c.updatedAt as Date)) continue;
    const data = { state: String(c.state), taxpayerId: (c.taxpayerId as string | null) ?? null, updatedAt: c.updatedAt as Date };
    if (existing) await prisma.botConversation.update({ where: { id: existing.id }, data });
    else await prisma.botConversation.create({ data: { id: String(c.id), channel: String(c.channel), address, ...data } });
    changed = true;
  }

  const missing = async <T extends { id: string }>(rows: T[], have: (ids: string[]) => Promise<{ id: string }[]>) => {
    if (!rows.length) return [];
    const present = new Set((await have(rows.map((r) => r.id))).map((r) => r.id));
    return rows.filter((r) => !present.has(r.id));
  };

  const inbound = await missing(revive(snap.inbound, DATES.inbound) as (Row & { id: string })[], (ids) =>
    prisma.inboundEvent.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  );
  for (const e of inbound) {
    // El id del proveedor es único: si esta copia ya tiene ese mensaje con otro id, se deja el suyo.
    await prisma.inboundEvent.create({ data: { ...e, address } as never }).then(() => (changed = true), () => undefined);
  }
  const outbound = await missing(revive(snap.outbound, DATES.outbound) as (Row & { id: string })[], (ids) =>
    prisma.outboundMessage.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  );
  for (const o of outbound) {
    await prisma.outboundMessage.create({ data: { ...o, address } as never }).then(() => (changed = true), () => undefined);
  }
  const codes = await missing(revive(snap.linkCodes, DATES.linkCodes) as (Row & { id: string })[], (ids) =>
    prisma.linkCode.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  );
  for (const k of codes) {
    // El código puede ser de una cuenta que esta copia no tiene: sin la cuenta no sirve y se omite.
    await prisma.linkCode.create({ data: { ...k, address } as never }).then(() => (changed = true), () => undefined);
  }
  return changed;
}
