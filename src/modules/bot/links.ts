import { randomBytes, randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { CHANNEL, ROLES } from "@/lib/constants";
import { maskPhone } from "@/lib/phone";
import type { CurrentUser } from "@/lib/auth";
import type { ServiceResult } from "@/modules/access/service";

// Vinculación de una cuenta con un número de WhatsApp.
// Nunca se vincula por coincidencia de teléfono, correo o CUIT: hace falta un código de un solo uso que
// pruebe las dos puntas (la sesión en la web y el control del número).
// - CODIGO_WEB: el usuario logueado genera un código de 6 dígitos y lo manda por WhatsApp.
// - ENLACE_BOT: el bot le manda al número un enlace, que el usuario abre en la web estando logueado.
// Sin dependencias de Next, para poder probarlo con `npm run verify`.

export const WEB_CODE_MINUTES = 10;
export const BOT_INVITE_HOURS = 24;
export const MAX_FAILED_CODES = 5; // por número, en la ventana de abajo
export const FAILED_WINDOW_MINUTES = 15;

const activeKey = (address: string) => `${CHANNEL.WHATSAPP}:${address}`;

/** Vínculo activo de un número (o null). */
export async function getActiveLink(address: string) {
  return prisma.channelLink.findUnique({ where: { activeKey: activeKey(address) }, include: { user: { include: { study: true } } } });
}

/** Vínculo activo de un usuario (o null). */
export async function getUserLink(userId: string) {
  return prisma.channelLink.findFirst({ where: { userId, channel: CHANNEL.WHATSAPP, status: "ACTIVO" } });
}

/** El usuario logueado genera un código para mandar por WhatsApp. Anula los anteriores sin usar. */
export async function createWebLinkCode(user: CurrentUser): Promise<{ code: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + WEB_CODE_MINUTES * 60_000);
  await prisma.linkCode.updateMany({ where: { userId: user.id, kind: "CODIGO_WEB", usedAt: null }, data: { usedAt: new Date() } });
  // El hash es único: si dos códigos coinciden por azar, se genera otro.
  for (let i = 0; i < 5; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      await prisma.linkCode.create({
        data: { studyId: user.studyId, kind: "CODIGO_WEB", codeHash: hashToken(`web:${code}`), userId: user.id, expiresAt },
      });
      await prisma.auditEvent.create({
        data: { studyId: user.studyId, actorId: user.id, action: "CHANNEL_LINK_CODE", entity: "User", entityId: user.id },
      });
      return { code, expiresAt };
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  throw new Error("No se pudo generar un código. Probá de nuevo.");
}

/** El bot genera un enlace para que el dueño del número lo abra en la web. Anula los anteriores de ese número. */
export async function createBotInvite(studyId: string, address: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + BOT_INVITE_HOURS * 3_600_000);
  await prisma.$transaction([
    prisma.linkCode.updateMany({ where: { address, kind: "ENLACE_BOT", usedAt: null }, data: { usedAt: new Date() } }),
    prisma.linkCode.create({ data: { studyId, kind: "ENLACE_BOT", codeHash: hashToken(`bot:${token}`), address, expiresAt } }),
  ]);
  return { token, expiresAt };
}

export type LinkResult = { ok: true; message: string; userName: string } | { ok: false; message: string };

/**
 * Crea el vínculo. Reglas:
 * - si el número ya está vinculado a OTRA cuenta, no se transfiere: hay que desvincularlo antes;
 * - si la cuenta tenía otro número, ese vínculo se cierra (el código nuevo prueba el número nuevo).
 * Todo en una transacción; `activeKey` único impide dos vínculos activos para el mismo número.
 */
async function link(userId: string, address: string, method: "CODIGO_WEB" | "ENLACE_BOT"): Promise<LinkResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) return { ok: false, message: "La cuenta no está activa." };
  // El bot es para clientes: una cuenta del estudio no se vincula (vería todos los contribuyentes).
  if (user.role !== ROLES.CLIENTE) return { ok: false, message: "Solo las cuentas de clientes se pueden vincular a WhatsApp." };

  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.channelLink.findUnique({ where: { activeKey: activeKey(address) } });
      if (current && current.userId !== userId) {
        return {
          ok: false as const,
          message:
            "Este número ya está vinculado a otra cuenta. Para usarlo con esta, primero hay que desvincularlo desde la otra cuenta o pedírselo al estudio.",
        };
      }
      if (current) return { ok: true as const, message: "Este WhatsApp ya estaba vinculado a tu cuenta.", userName: user.name };

      const previous = await tx.channelLink.findFirst({ where: { userId, channel: CHANNEL.WHATSAPP, status: "ACTIVO" } });
      if (previous) {
        await tx.channelLink.update({
          where: { id: previous.id },
          data: { status: "DESVINCULADO", activeKey: null, unlinkedAt: new Date(), unlinkedBy: userId, unlinkReason: "Cambio de número verificado" },
        });
      }
      await tx.channelLink.create({
        data: { studyId: user.studyId, userId, channel: CHANNEL.WHATSAPP, address, status: "ACTIVO", activeKey: activeKey(address), method },
      });
      await tx.auditEvent.create({
        data: {
          studyId: user.studyId,
          actorId: userId,
          action: "CHANNEL_LINK",
          entity: "User",
          entityId: userId,
          detail: `${maskPhone(address)}${previous ? ` (reemplaza a ${maskPhone(previous.address)})` : ""} · ${method === "CODIGO_WEB" ? "código desde la web" : "enlace del bot"}`,
        },
      });
      return { ok: true as const, message: "Listo, vinculamos este WhatsApp con tu cuenta.", userName: user.name };
    });
  } catch (err) {
    // Dos vinculaciones simultáneas del mismo número: gana una, la otra ve el vínculo ya creado.
    if ((err as { code?: string }).code === "P2002") return { ok: false, message: "Este número se acaba de vincular. Escribí *menú*." };
    throw err;
  }
}

/** Intentos fallidos recientes de un número (para limitar la adivinación de códigos). */
async function recentFailures(address: string) {
  const since = new Date(Date.now() - FAILED_WINDOW_MINUTES * 60_000);
  return prisma.auditEvent.count({ where: { action: "CHANNEL_LINK_FAILED", entityId: address, createdAt: { gte: since } } });
}

/** El dueño del número manda por WhatsApp el código que generó en la web. */
export async function consumeWebLinkCode(address: string, code: string): Promise<LinkResult> {
  if ((await recentFailures(address)) >= MAX_FAILED_CODES) {
    return { ok: false, message: `Hubo demasiados intentos con códigos incorrectos. Esperá ${FAILED_WINDOW_MINUTES} minutos y generá uno nuevo.` };
  }
  const row = await prisma.linkCode.findUnique({ where: { codeHash: hashToken(`web:${code}`) } });
  const now = new Date();
  // Se marca como usado con una condición: si llegan dos mensajes con el mismo código, solo uno lo consume.
  const consumed =
    row && row.kind === "CODIGO_WEB" && row.userId && !row.usedAt && row.expiresAt > now
      ? await prisma.linkCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now, attempts: { increment: 1 } } })
      : { count: 0 };
  if (!row || consumed.count === 0 || !row.userId) {
    const studyId = row?.studyId ?? (await prisma.study.findFirst({ where: { acceptsSignups: true } }))?.id;
    if (studyId) {
      await prisma.auditEvent.create({
        data: { studyId, action: "CHANNEL_LINK_FAILED", entity: "ChannelAddress", entityId: address, detail: maskPhone(address) },
      });
    }
    const expired = row && row.expiresAt <= now && !row.usedAt;
    return {
      ok: false,
      message: expired
        ? "Ese código venció. Generá uno nuevo en la web (Mi perfil → WhatsApp)."
        : "El código no es válido o ya se usó. Revisalo o generá uno nuevo en la web (Mi perfil → WhatsApp).",
    };
  }
  return link(row.userId, address, "CODIGO_WEB");
}

/** Datos para mostrar en la web antes de confirmar un enlace del bot (o null si no sirve). */
export async function getBotInvite(token: string) {
  const row = await prisma.linkCode.findUnique({ where: { codeHash: hashToken(`bot:${token}`) } });
  if (!row || row.kind !== "ENLACE_BOT" || row.usedAt || row.expiresAt <= new Date() || !row.address) return null;
  return { address: row.address, maskedAddress: maskPhone(row.address), expiresAt: row.expiresAt };
}

/** El usuario logueado confirma en la web el enlace que recibió por WhatsApp. */
export async function consumeBotInvite(user: CurrentUser, token: string): Promise<LinkResult> {
  const row = await prisma.linkCode.findUnique({ where: { codeHash: hashToken(`bot:${token}`) } });
  const now = new Date();
  if (!row || row.kind !== "ENLACE_BOT" || !row.address || row.studyId !== user.studyId) {
    return { ok: false, message: "El enlace no es válido. Pedí uno nuevo escribiéndole al bot." };
  }
  const consumed = await prisma.linkCode.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now, userId: user.id },
  });
  if (consumed.count === 0) return { ok: false, message: "El enlace venció o ya se usó. Pedí uno nuevo escribiéndole al bot." };
  return link(user.id, row.address, "ENLACE_BOT");
}

/** Desvincula: el dueño de la cuenta o un administrador de su estudio. Corta el acceso por WhatsApp al instante. */
export async function unlinkChannel(actor: CurrentUser, linkId: string, reason: string): Promise<ServiceResult> {
  const row = await prisma.channelLink.findUnique({ where: { id: linkId }, include: { user: true } });
  const allowed = row && row.status === "ACTIVO" && (row.userId === actor.id || (actor.role === ROLES.ADMIN && row.studyId === actor.studyId));
  if (!row || !allowed) return { ok: false, message: "El vínculo no existe o ya estaba desvinculado." };
  await prisma.$transaction([
    prisma.channelLink.update({
      where: { id: row.id },
      data: { status: "DESVINCULADO", activeKey: null, unlinkedAt: new Date(), unlinkedBy: actor.id, unlinkReason: reason.trim() || null },
    }),
    prisma.auditEvent.create({
      data: {
        studyId: row.studyId,
        actorId: actor.id,
        action: "CHANNEL_UNLINK",
        entity: "User",
        entityId: row.userId,
        detail: `${row.user.name}: ${maskPhone(row.address)}${reason.trim() ? ` · ${reason.trim()}` : ""}`,
      },
    }),
  ]);
  return { ok: true, message: "WhatsApp desvinculado. Desde ese número ya no se puede consultar nada." };
}

/** Vínculos activos del estudio, para el backoffice. */
export async function listStudyLinks(admin: CurrentUser) {
  if (admin.role !== ROLES.ADMIN) throw new Error("Solo un administrador puede hacer esto.");
  const rows = await prisma.channelLink.findMany({ where: { studyId: admin.studyId, status: "ACTIVO" } });
  return new Map(rows.map((r) => [r.userId, { id: r.id, masked: maskPhone(r.address), linkedAt: r.linkedAt }]));
}
