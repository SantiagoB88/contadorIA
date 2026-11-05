import { cookies } from "next/headers";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { prisma } from "./db";
import { CHANNEL } from "./constants";
import { demoSecret } from "./demo-secret";
import { usesBundledDemo } from "./vercel-demo";

// Cuentas creadas durante la demo de Vercel (sin base compartida).
// En Vercel cada copia del servidor tiene su propia base de demo: una cuenta creada desde el simulador existe solo en
// la copia que atendió el chat, y otra copia (la del ingreso o la del panel) no la encontraba ("datos incorrectos" o
// un ida y vuelta infinito entre Ingresar y el panel). Para que la demo funcione sin servicios externos, al crear o
// cambiar una cuenta el navegador guarda una copia cifrada de sus datos básicos (usuario, contraseña cifrada,
// contribuyentes, accesos, pedidos de acceso, WhatsApp vinculado, enlaces de confirmación pendientes y los últimos
// correos de prueba) y cualquier copia del servidor que no los tenga los reconstruye antes de atender. Se cifra con
// AES-GCM y una clave derivada del secreto de la demo: nadie puede leerla, fabricarla ni cambiarla.
// Solo en la demo de Vercel (usesBundledDemo). En la compu y en una instalación real no se usa nunca.
// Lo que se crea después (solicitudes, facturas, conversaciones) vive en la copia que lo atendió.

const COOKIE = "cs_demo_cuentas";
const MAX_ACCOUNTS = 2; // la cookie no puede pasar de 4 KB
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

type Snapshot = {
  user: {
    id: string;
    studyId: string;
    email: string;
    name: string;
    phone: string | null;
    passwordHash: string;
    role: string;
    active: boolean;
    emailVerifiedAt: string | null;
    mustChangePassword: boolean;
    tempPasswordExpiresAt: string | null;
    createdAt: string;
    updatedAt?: string;
  };
  taxpayers: { id: string; studyId: string; cuit: string; name: string; activity: string; categoryCode: string | null; startDate: string }[];
  accesses: { taxpayerId: string; status: string; updatedAt?: string }[];
  requests: {
    id: string;
    cuit: string;
    declaredName: string;
    declaredActivity: string;
    declaredCategory: string | null;
    declaredStartDate: string;
    status: string;
    reviewNote: string | null;
    reviewedAt: string | null;
    taxpayerId: string | null;
    createdAt: string;
  }[];
  links: { address: string; method: string; linkedAt: string }[];
  tokens?: { id: string; type: string; tokenHash: string; expiresAt: string }[];
  emails?: { id: string; to: string; subject: string; body: string; createdAt: string }[];
};

const keyFor = (secret: string) => createHash("sha256").update(`${secret}:cuentas-demo`).digest();

async function readBundle(): Promise<Snapshot[]> {
  const raw = (await cookies()).get(COOKIE)?.value;
  const secret = await demoSecret();
  if (!raw || !secret) return [];
  try {
    const data = Buffer.from(raw, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
    return JSON.parse(inflateRawSync(plain).toString("utf8")) as Snapshot[];
  } catch {
    return []; // alterada, de otro deploy o vieja: se ignora
  }
}

async function writeBundle(list: Snapshot[]) {
  const secret = await demoSecret();
  if (!secret) return;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const encrypted = Buffer.concat([cipher.update(deflateRawSync(Buffer.from(JSON.stringify(list.slice(-MAX_ACCOUNTS))))), cipher.final()]);
  const value = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

async function snapshot(userId: string): Promise<Snapshot | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const [accesses, requests, links, tokens, emails] = await Promise.all([
    prisma.taxpayerAccess.findMany({ where: { userId }, include: { taxpayer: true } }),
    prisma.accessRequest.findMany({ where: { userId } }),
    prisma.channelLink.findMany({ where: { userId, status: "ACTIVO" } }),
    prisma.authToken.findMany({ where: { userId, usedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.outboxEmail.findMany({ where: { to: user.email }, orderBy: { createdAt: "desc" }, take: 2 }),
  ]);
  return {
    user: {
      id: user.id,
      studyId: user.studyId,
      email: user.email,
      name: user.name,
      phone: user.phone,
      passwordHash: user.passwordHash,
      role: user.role,
      active: user.active,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      mustChangePassword: user.mustChangePassword,
      tempPasswordExpiresAt: user.tempPasswordExpiresAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
    taxpayers: accesses.map(({ taxpayer: t }) => ({
      id: t.id,
      studyId: t.studyId,
      cuit: t.cuit,
      name: t.name,
      activity: t.activity,
      categoryCode: t.categoryCode,
      startDate: t.startDate,
    })),
    accesses: accesses.map((a) => ({ taxpayerId: a.taxpayerId, status: a.status, updatedAt: a.updatedAt.toISOString() })),
    requests: requests.map((r) => ({
      id: r.id,
      cuit: r.cuit,
      declaredName: r.declaredName,
      declaredActivity: r.declaredActivity,
      declaredCategory: r.declaredCategory,
      declaredStartDate: r.declaredStartDate,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      taxpayerId: r.taxpayerId,
      createdAt: r.createdAt.toISOString(),
    })),
    links: links.map((l) => ({ address: l.address, method: l.method, linkedAt: l.linkedAt.toISOString() })),
    tokens: tokens.map((t) => ({ id: t.id, type: t.type, tokenHash: t.tokenHash, expiresAt: t.expiresAt.toISOString() })),
    emails: emails.map((e) => ({ id: e.id, to: e.to, subject: e.subject, body: e.body, createdAt: e.createdAt.toISOString() })),
  };
}

/** Guarda (o actualiza) en el navegador la copia firmada de una cuenta creada en la demo. */
export async function rememberDemoAccount(userId: string, onlyIfKnown = false): Promise<void> {
  if (!usesBundledDemo) return;
  try {
    const list = await readBundle();
    const known = list.find((s) => s.user.id === userId);
    if (onlyIfKnown && !known) return;
    // Primero se pone al día esta copia con lo que trae el navegador: si no, una copia con datos viejos (por ejemplo,
    // el correo sin confirmar) pisaría lo más nuevo al guardar.
    if (known) await restore(known).catch(() => undefined);
    const snap = await snapshot(userId);
    if (!snap) return;
    await writeBundle([...list.filter((s) => s.user.id !== userId), snap]);
  } catch (err) {
    // Fuera de un pedido del navegador (por ejemplo, el webhook) no hay cookies: no hace falta recordar nada.
    if (!(err instanceof Error && /cookies|request scope|outside a request/i.test(err.message))) throw err;
  }
}

/** Igual que rememberDemoAccount, buscando la cuenta por correo (registro, recuperar contraseña). */
export async function rememberDemoAccountByEmail(email: string): Promise<void> {
  if (!usesBundledDemo) return;
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
  if (user) await rememberDemoAccount(user.id);
}

/** Vuelve a guardar las cuentas que el navegador ya trae, con lo último de esta copia (correo confirmado, contraseña). */
export async function refreshDemoAccounts(): Promise<void> {
  if (!usesBundledDemo) return;
  try {
    const list = await readBundle();
    for (const s of list) await rememberDemoAccount(s.user.id, true);
  } catch {
    // fuera de un pedido del navegador: nada que actualizar
  }
}

/** Reconstruye en esta copia del servidor las cuentas de la demo que el navegador trae y que acá faltan. */
export async function restoreDemoAccounts(): Promise<void> {
  if (!usesBundledDemo) return;
  let list: Snapshot[];
  try {
    list = await readBundle();
  } catch {
    return;
  }
  for (const s of list) await restore(s).catch((err) => console.error("[demo] No se pudo reconstruir una cuenta:", err instanceof Error ? err.message : err));
}

async function restore(s: Snapshot) {
  const u = s.user;
  // Si esta copia tiene otros identificadores (por ejemplo, se restableció), se usa el estudio que acepta altas y los
  // contribuyentes por CUIT.
  const studyId = (await prisma.study.findUnique({ where: { id: u.studyId }, select: { id: true } }))?.id ??
    (await prisma.study.findFirst({ where: { acceptsSignups: true }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
  if (!studyId) return;
  const cuitOf = new Map(s.taxpayers.map((t) => [t.id, t.cuit]));
  const taxpayerId = async (id: string | null) => {
    if (!id) return null;
    if (await prisma.taxpayer.findUnique({ where: { id }, select: { id: true } })) return id;
    const cuit = cuitOf.get(id);
    return cuit ? ((await prisma.taxpayer.findUnique({ where: { studyId_cuit: { studyId, cuit } }, select: { id: true } }))?.id ?? null) : null;
  };
  const fields = {
    name: u.name,
    phone: u.phone,
    passwordHash: u.passwordHash,
    active: u.active,
    emailVerifiedAt: u.emailVerifiedAt ? new Date(u.emailVerifiedAt) : null,
    mustChangePassword: u.mustChangePassword,
    tempPasswordExpiresAt: u.tempPasswordExpiresAt ? new Date(u.tempPasswordExpiresAt) : null,
  };
  // Gana siempre lo más nuevo: lo que trae el navegador solo se aplica si es posterior a lo que tiene esta copia (si
  // no, un cambio recién hecho acá, como una contraseña nueva, se perdería).
  const at = (iso: string | null | undefined) => (iso ? new Date(iso) : new Date(0));
  const updatedAt = at(u.updatedAt);
  const existing = await prisma.user.findUnique({ where: { id: u.id } });
  if (existing) {
    if (updatedAt > existing.updatedAt) await prisma.user.update({ where: { id: u.id }, data: { ...fields, updatedAt } });
  } else {
    // Solo se crean clientes: un usuario del estudio (por ejemplo, un administrador con la contraseña blanqueada) ya
    // está en la base de ejemplo y se actualiza arriba.
    if (u.role !== "CLIENTE") return;
    if (await prisma.user.findUnique({ where: { email: u.email } })) return; // otra cuenta con ese correo en esta copia
    await prisma.user.create({ data: { id: u.id, studyId, email: u.email, role: "CLIENTE", createdAt: new Date(u.createdAt), updatedAt, ...fields } });
  }
  for (const t of s.taxpayers) {
    if (await prisma.taxpayer.findUnique({ where: { id: t.id } })) continue;
    if (await prisma.taxpayer.findUnique({ where: { studyId_cuit: { studyId, cuit: t.cuit } } })) continue;
    await prisma.taxpayer.create({ data: { ...t, studyId } });
  }
  for (const a of s.accesses) {
    const tpId = await taxpayerId(a.taxpayerId);
    if (!tpId) continue;
    const current = await prisma.taxpayerAccess.findUnique({ where: { userId_taxpayerId: { userId: u.id, taxpayerId: tpId } } });
    const changedAt = at(a.updatedAt);
    if (current && (current.status === a.status || changedAt <= current.updatedAt)) continue;
    await prisma.taxpayerAccess.upsert({
      where: { userId_taxpayerId: { userId: u.id, taxpayerId: tpId } },
      update: { status: a.status, updatedAt: changedAt },
      create: { userId: u.id, taxpayerId: tpId, status: a.status, updatedAt: changedAt },
    });
  }
  for (const r of s.requests) {
    const found = await prisma.accessRequest.findUnique({ where: { id: r.id }, select: { status: true, reviewedAt: true, createdAt: true } });
    // Una solicitud solo avanza (pendiente → revisada): se aplica si la del navegador se revisó después.
    if (found && (found.status === r.status || at(r.reviewedAt ?? r.createdAt) <= (found.reviewedAt ?? found.createdAt))) continue;
    const data = {
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedAt: r.reviewedAt ? new Date(r.reviewedAt) : null,
      taxpayerId: await taxpayerId(r.taxpayerId),
    };
    await prisma.accessRequest.upsert({
      where: { id: r.id },
      update: data,
      create: {
        id: r.id,
        studyId,
        userId: u.id,
        cuit: r.cuit,
        declaredName: r.declaredName,
        declaredActivity: r.declaredActivity,
        declaredCategory: r.declaredCategory,
        declaredStartDate: r.declaredStartDate,
        createdAt: new Date(r.createdAt),
        ...data,
      },
    });
  }
  for (const t of s.tokens ?? []) {
    if (await prisma.authToken.findUnique({ where: { tokenHash: t.tokenHash } })) continue;
    await prisma.authToken.create({ data: { id: t.id, userId: u.id, type: t.type, tokenHash: t.tokenHash, expiresAt: new Date(t.expiresAt) } }).catch(() => undefined);
  }
  for (const e of s.emails ?? []) {
    if (await prisma.outboxEmail.findUnique({ where: { id: e.id } })) continue;
    await prisma.outboxEmail.create({ data: { ...e, createdAt: new Date(e.createdAt) } });
  }
  for (const l of s.links) {
    const activeKey = `${CHANNEL.WHATSAPP}:${l.address}`;
    if (await prisma.channelLink.findUnique({ where: { activeKey } })) continue;
    // Si esta copia ya tiene ese vínculo (o uno más nuevo) y después se desvinculó, no se vuelve a vincular.
    if (await prisma.channelLink.findFirst({ where: { userId: u.id, address: l.address, linkedAt: { gte: new Date(l.linkedAt) } } })) continue;
    await prisma.channelLink.create({
      data: { studyId, userId: u.id, channel: CHANNEL.WHATSAPP, address: l.address, status: "ACTIVO", activeKey, method: l.method, linkedAt: new Date(l.linkedAt) },
    });
  }
}

/** Al restablecer la demo, el navegador deja de traer las cuentas creadas antes. */
export async function forgetDemoAccounts(): Promise<void> {
  if (!usesBundledDemo) return;
  (await cookies()).delete(COOKIE);
}
